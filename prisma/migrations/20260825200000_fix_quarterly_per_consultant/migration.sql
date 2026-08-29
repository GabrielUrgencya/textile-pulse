-- LISION Vendas — Fix 1a: trimestral (QUARTERLY) é POR CONSULTORA, não coletiva.
--
-- O dashboard da consultora lê metas QUARTERLY por consultora (profile_id = consultora).
-- Duas correções:
--   (a) set_goal_assignment_v2: elegibilidade tratava QUARTERLY como coletiva
--       (bloqueava profile_id). Agora INDIVIDUAL e QUARTERLY exigem consultora;
--       apenas COLLECTIVE exige profile_id NULL.
--   (b) provision-defaults: atribuía QUARTERLY sem consultora (profile_id NULL).
--       Agora atribui INDIVIDUAL e QUARTERLY por consultora; só COLLECTIVE fica sem.

-- (a) Corrige a elegibilidade na v2 (mantém o restante idêntico à 20260825180000).
CREATE OR REPLACE FUNCTION public.sales_admin_set_goal_assignment_v2(
  p_assignment_id uuid, p_goal_id uuid, p_period_id uuid, p_profile_id uuid, p_is_active boolean,
  p_target_override numeric, p_commission_override numeric, p_expected_revision bigint
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE v_tenant uuid := public.auth_tenant_id(); v_actor uuid := auth.uid(); v_goal public.sales_goals%ROWTYPE;
        v_before jsonb; v_after jsonb; v_id uuid; v_target numeric; v_commission numeric;
BEGIN
  IF v_tenant IS NULL OR v_actor IS NULL OR NOT public.sales_is_admin() THEN RAISE EXCEPTION 'sales_admin_required' USING ERRCODE='42501'; END IF;
  IF p_goal_id IS NULL OR p_period_id IS NULL OR p_is_active IS NULL OR p_expected_revision IS NULL THEN RAISE EXCEPTION 'sales_assignment_validation' USING ERRCODE='22023'; END IF;
  IF (p_target_override IS NOT NULL AND p_target_override < 0) OR (p_commission_override IS NOT NULL AND p_commission_override NOT BETWEEN 0 AND 100) THEN RAISE EXCEPTION 'sales_assignment_validation' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant::text || ':sales-assignments:' || p_period_id::text, 0));
  IF NOT EXISTS(SELECT 1 FROM public.sales_periods sp WHERE sp.tenant_id=v_tenant AND sp.id=p_period_id AND sp.status='OPEN' FOR UPDATE) THEN RAISE EXCEPTION 'sales_closed_period_or_not_found' USING ERRCODE='25006'; END IF;
  SELECT * INTO v_goal FROM public.sales_goals sg WHERE sg.tenant_id=v_tenant AND sg.id=p_goal_id AND sg.is_active;
  IF v_goal.id IS NULL THEN RAISE EXCEPTION 'sales_not_found_or_out_of_scope' USING ERRCODE='P0002'; END IF;
  IF (v_goal.valid_from IS NOT NULL AND v_goal.valid_from > (SELECT sp.ends_on FROM public.sales_periods sp WHERE sp.tenant_id=v_tenant AND sp.id=p_period_id)) OR (v_goal.valid_until IS NOT NULL AND v_goal.valid_until < (SELECT sp.starts_on FROM public.sales_periods sp WHERE sp.tenant_id=v_tenant AND sp.id=p_period_id)) THEN RAISE EXCEPTION 'sales_goal_outside_period_validity' USING ERRCODE='23514'; END IF;
  -- INDIVIDUAL e QUARTERLY são por consultora; apenas COLLECTIVE é sem consultora.
  IF (v_goal.scope IN ('INDIVIDUAL','QUARTERLY') AND (p_profile_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.sales_memberships sm WHERE sm.tenant_id=v_tenant AND sm.profile_id=p_profile_id AND sm.role='CONSULTANT' AND sm.is_active))) OR (v_goal.scope='COLLECTIVE' AND p_profile_id IS NOT NULL) THEN RAISE EXCEPTION 'sales_ineligible_assignee' USING ERRCODE='23514'; END IF;

  v_target := COALESCE(p_target_override, v_goal.target_value);
  v_commission := COALESCE(p_commission_override, v_goal.commission_percent);

  IF p_assignment_id IS NULL THEN
    IF p_expected_revision <> 0 THEN RAISE EXCEPTION 'sales_stale_revision' USING ERRCODE='40001'; END IF;
    SELECT to_jsonb(sga),sga.id INTO v_before,v_id FROM public.sales_goal_assignments sga WHERE sga.tenant_id=v_tenant AND sga.goal_id=p_goal_id AND sga.period_id=p_period_id AND sga.profile_id IS NOT DISTINCT FROM p_profile_id FOR UPDATE;
    IF v_id IS NULL THEN
      INSERT INTO public.sales_goal_assignments(tenant_id,goal_id,period_id,profile_id,target_value_snapshot,commission_percent_snapshot,target_override,commission_override,goal_name_snapshot,goal_scope_snapshot,goal_sort_order_snapshot,goal_is_challenge_snapshot,valid_from_snapshot,valid_until_snapshot,goal_revision,is_active,revision)
      VALUES(v_tenant,p_goal_id,p_period_id,p_profile_id,v_target,v_commission,p_target_override,p_commission_override,v_goal.name,v_goal.scope,v_goal.sort_order,v_goal.is_challenge,v_goal.valid_from,v_goal.valid_until,v_goal.revision,p_is_active,1)
      RETURNING id,to_jsonb(sales_goal_assignments.*) INTO v_id,v_after;
    ELSE
      UPDATE public.sales_goal_assignments SET is_active=p_is_active,target_value_snapshot=v_target,commission_percent_snapshot=v_commission,target_override=p_target_override,commission_override=p_commission_override,goal_name_snapshot=v_goal.name,goal_scope_snapshot=v_goal.scope,goal_sort_order_snapshot=v_goal.sort_order,goal_is_challenge_snapshot=v_goal.is_challenge,valid_from_snapshot=v_goal.valid_from,valid_until_snapshot=v_goal.valid_until,goal_revision=v_goal.revision,revision=revision+1,updated_at=now() WHERE tenant_id=v_tenant AND id=v_id RETURNING to_jsonb(sales_goal_assignments.*) INTO v_after;
    END IF;
  ELSE
    SELECT to_jsonb(sga) INTO v_before FROM public.sales_goal_assignments sga WHERE sga.tenant_id=v_tenant AND sga.id=p_assignment_id AND sga.period_id=p_period_id FOR UPDATE;
    IF v_before IS NULL THEN RAISE EXCEPTION 'sales_not_found_or_out_of_scope' USING ERRCODE='P0002'; END IF;
    IF (v_before->>'revision')::bigint <> p_expected_revision THEN RAISE EXCEPTION 'sales_stale_revision' USING ERRCODE='40001', DETAIL=v_before::text; END IF;
    UPDATE public.sales_goal_assignments SET goal_id=p_goal_id,profile_id=p_profile_id,target_value_snapshot=v_target,commission_percent_snapshot=v_commission,target_override=p_target_override,commission_override=p_commission_override,goal_name_snapshot=v_goal.name,goal_scope_snapshot=v_goal.scope,goal_sort_order_snapshot=v_goal.sort_order,goal_is_challenge_snapshot=v_goal.is_challenge,valid_from_snapshot=v_goal.valid_from,valid_until_snapshot=v_goal.valid_until,goal_revision=v_goal.revision,is_active=p_is_active,revision=revision+1,updated_at=now() WHERE tenant_id=v_tenant AND id=p_assignment_id RETURNING id,to_jsonb(sales_goal_assignments.*) INTO v_id,v_after;
  END IF;
  INSERT INTO public.sales_audit_events(tenant_id,actor_id,action,entity_type,entity_id,details) VALUES(v_tenant,v_actor,'SALES_GOAL_ASSIGNMENT_SET','sales_goal_assignment',v_id,jsonb_build_object('before',v_before,'after',v_after));
  RETURN v_after - 'tenant_id';
END;
$$;

-- (b) Corrige o provisionamento: QUARTERLY passa a ser atribuída por consultora.
CREATE OR REPLACE FUNCTION public.sales_admin_provision_defaults_v1()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant uuid := public.auth_tenant_id();
  v_actor  uuid := auth.uid();
  v_tz text; v_today date; v_month_start date; v_month_end date;
  v_period_id uuid; v_period_open boolean := false; v_period_created boolean := false;
  v_config_created int := 0; v_methods_created int := 0; v_goals_created int := 0;
  v_assignments_created int := 0; v_n int;
BEGIN
  IF v_tenant IS NULL OR v_actor IS NULL OR NOT public.sales_is_admin() THEN
    RAISE EXCEPTION 'sales_admin_required' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant::text || ':sales-provision', 0));

  INSERT INTO public.sales_config (tenant_id, pieces_per_set, timezone, week_starts_on, allow_team_aggregates, revision)
  VALUES (v_tenant, 2, 'America/Sao_Paulo', 1, false, 1)
  ON CONFLICT (tenant_id) DO NOTHING;
  GET DIAGNOSTICS v_config_created = ROW_COUNT;

  SELECT COALESCE(sc.timezone, 'America/Sao_Paulo') INTO v_tz FROM public.sales_config sc WHERE sc.tenant_id = v_tenant;
  v_tz := COALESCE(v_tz, 'America/Sao_Paulo');
  v_today := (now() AT TIME ZONE v_tz)::date;

  IF NOT EXISTS (SELECT 1 FROM public.sales_payment_methods WHERE tenant_id = v_tenant) THEN
    INSERT INTO public.sales_payment_methods (tenant_id, name, sort_order, is_active)
    VALUES (v_tenant, 'PIX', 1, true), (v_tenant, 'Cartão de crédito', 2, true), (v_tenant, 'Dinheiro', 3, true)
    ON CONFLICT (tenant_id, name) DO NOTHING;
    GET DIAGNOSTICS v_methods_created = ROW_COUNT;
  END IF;

  SELECT id INTO v_period_id FROM public.sales_periods
  WHERE tenant_id = v_tenant AND status = 'OPEN' ORDER BY starts_on DESC LIMIT 1;
  IF v_period_id IS NULL THEN
    v_month_start := date_trunc('month', v_today)::date;
    v_month_end := (date_trunc('month', v_today) + interval '1 month - 1 day')::date;
    INSERT INTO public.sales_periods (tenant_id, starts_on, ends_on, status)
    VALUES (v_tenant, v_month_start, v_month_end, 'OPEN')
    ON CONFLICT (tenant_id, starts_on, ends_on) DO NOTHING
    RETURNING id INTO v_period_id;
    IF v_period_id IS NULL THEN
      SELECT id INTO v_period_id FROM public.sales_periods
      WHERE tenant_id = v_tenant AND starts_on = v_month_start AND ends_on = v_month_end AND status = 'OPEN';
    ELSE v_period_created := true; END IF;
  END IF;
  v_period_open := v_period_id IS NOT NULL;

  INSERT INTO public.sales_goals
    (tenant_id, provisioning_key, name, scope, target_value, commission_percent, sort_order, is_challenge, is_active, revision)
  SELECT v_tenant, g.key, g.gname, g.gscope::public."SalesGoalScope", g.target, g.commission, g.sort_order, g.is_challenge, true, 1
  FROM (VALUES
    ('META_1','Meta 1','INDIVIDUAL',15000,2,1,false),
    ('META_2','Meta 2','INDIVIDUAL',25000,3,2,false),
    ('META_3','Meta 3','INDIVIDUAL',40000,4,3,false),
    ('CHALLENGE','Desafio','INDIVIDUAL',60000,5,4,true),
    ('QUARTERLY','Trimestral','QUARTERLY',120000,0,5,false),
    ('COLLECTIVE','Coletiva','COLLECTIVE',200000,0,6,false)
  ) AS g(key, gname, gscope, target, commission, sort_order, is_challenge)
  ON CONFLICT (tenant_id, provisioning_key) WHERE provisioning_key IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS v_goals_created = ROW_COUNT;

  IF v_period_open THEN
    -- INDIVIDUAIS e TRIMESTRAIS: uma por consultora ativa.
    INSERT INTO public.sales_goal_assignments
      (tenant_id, goal_id, period_id, profile_id, target_value_snapshot, commission_percent_snapshot,
       goal_name_snapshot, goal_scope_snapshot, goal_sort_order_snapshot, goal_is_challenge_snapshot,
       valid_from_snapshot, valid_until_snapshot, goal_revision, is_active, revision)
    SELECT g.tenant_id, g.id, v_period_id, sm.profile_id, g.target_value, g.commission_percent,
           g.name, g.scope, g.sort_order, g.is_challenge, g.valid_from, g.valid_until, g.revision, true, 1
    FROM public.sales_goals g
    JOIN public.sales_memberships sm ON sm.tenant_id = g.tenant_id AND sm.role = 'CONSULTANT' AND sm.is_active
    WHERE g.tenant_id = v_tenant AND g.is_active AND g.scope IN ('INDIVIDUAL','QUARTERLY') AND g.provisioning_key IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.sales_goal_assignments a WHERE a.tenant_id = g.tenant_id AND a.goal_id = g.id AND a.period_id = v_period_id AND a.profile_id = sm.profile_id);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_assignments_created := v_assignments_created + v_n;

    -- COLETIVAS: uma atribuição sem consultora (profile_id NULL).
    INSERT INTO public.sales_goal_assignments
      (tenant_id, goal_id, period_id, profile_id, target_value_snapshot, commission_percent_snapshot,
       goal_name_snapshot, goal_scope_snapshot, goal_sort_order_snapshot, goal_is_challenge_snapshot,
       valid_from_snapshot, valid_until_snapshot, goal_revision, is_active, revision)
    SELECT g.tenant_id, g.id, v_period_id, NULL, g.target_value, g.commission_percent,
           g.name, g.scope, g.sort_order, g.is_challenge, g.valid_from, g.valid_until, g.revision, true, 1
    FROM public.sales_goals g
    WHERE g.tenant_id = v_tenant AND g.is_active AND g.scope = 'COLLECTIVE' AND g.provisioning_key IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.sales_goal_assignments a WHERE a.tenant_id = g.tenant_id AND a.goal_id = g.id AND a.period_id = v_period_id AND a.profile_id IS NULL);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_assignments_created := v_assignments_created + v_n;
  END IF;

  INSERT INTO public.sales_audit_events (tenant_id, actor_id, action, entity_type, entity_id, details)
  VALUES (v_tenant, v_actor, 'SALES_DEFAULTS_PROVISIONED', 'sales_tenant', v_tenant,
    jsonb_build_object('config_created', v_config_created > 0, 'methods_created', v_methods_created,
      'period_created', v_period_created, 'goals_created', v_goals_created, 'assignments_created', v_assignments_created));

  RETURN jsonb_build_object('config_created', v_config_created > 0, 'methods_created', v_methods_created,
    'period_id', v_period_id, 'period_created', v_period_created, 'goals_created', v_goals_created,
    'assignments_created', v_assignments_created);
END;
$$;

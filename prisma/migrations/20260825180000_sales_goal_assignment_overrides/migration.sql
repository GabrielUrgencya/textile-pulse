-- LISION Vendas — Story 11.2 (expandida): números por consultora.
--
-- Cada atribuição pode ter target/comissão PRÓPRIOS (override do snapshot). Se nulos,
-- herda os valores da meta. "Personalizado prevalece": editar o valor-base da meta
-- re-sincroniza apenas as atribuições SEM override (COALESCE(override, base)).
--
-- Backward-compatible: colunas nullable (default NULL → COALESCE(NULL, base) = base).

ALTER TABLE public.sales_goal_assignments
  ADD COLUMN IF NOT EXISTS target_override numeric,
  ADD COLUMN IF NOT EXISTS commission_override numeric;

DO $$ BEGIN
  ALTER TABLE public.sales_goal_assignments
    ADD CONSTRAINT sales_goal_assignments_target_override_chk CHECK (target_override IS NULL OR target_override >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.sales_goal_assignments
    ADD CONSTRAINT sales_goal_assignments_commission_override_chk CHECK (commission_override IS NULL OR (commission_override >= 0 AND commission_override <= 100));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- set_goal: re-sync de snapshots respeitando overrides (personalizado prevalece).
CREATE OR REPLACE FUNCTION public.sales_admin_set_goal_v1(
  p_goal_id uuid, p_provisioning_key text, p_name text, p_scope public."SalesGoalScope", p_target_value numeric,
  p_commission_percent numeric, p_sort_order integer, p_is_challenge boolean, p_is_active boolean,
  p_valid_from date, p_valid_until date, p_expected_revision bigint
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE v_tenant uuid := public.auth_tenant_id(); v_actor uuid := auth.uid(); v_before jsonb; v_after jsonb; v_id uuid;
BEGIN
  IF v_tenant IS NULL OR v_actor IS NULL OR NOT public.sales_is_admin() THEN RAISE EXCEPTION 'sales_admin_required' USING ERRCODE = '42501'; END IF;
  IF length(btrim(COALESCE(p_name,''))) NOT BETWEEN 1 AND 120 OR p_scope IS NULL OR p_target_value < 0 OR p_commission_percent NOT BETWEEN 0 AND 100 OR p_sort_order < 0 OR p_is_challenge IS NULL OR p_is_active IS NULL OR p_expected_revision IS NULL OR (p_valid_from IS NOT NULL AND p_valid_until IS NOT NULL AND p_valid_until < p_valid_from) THEN RAISE EXCEPTION 'sales_goal_validation' USING ERRCODE = '22023'; END IF;
  IF p_provisioning_key IS NOT NULL AND (p_provisioning_key NOT IN ('META_1','META_2','META_3','CHALLENGE','QUARTERLY','COLLECTIVE') OR (p_provisioning_key='COLLECTIVE') <> (p_scope='COLLECTIVE')) THEN RAISE EXCEPTION 'sales_goal_identity_scope_invalid' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant::text || ':sales-goals', 0));
  IF p_goal_id IS NULL THEN
    IF p_expected_revision <> 0 THEN RAISE EXCEPTION 'sales_stale_revision' USING ERRCODE = '40001'; END IF;
    INSERT INTO public.sales_goals(tenant_id,provisioning_key,name,scope,target_value,commission_percent,sort_order,is_challenge,is_active,valid_from,valid_until,revision)
    VALUES(v_tenant,p_provisioning_key,btrim(p_name),p_scope,p_target_value,p_commission_percent,p_sort_order,p_is_challenge,p_is_active,p_valid_from,p_valid_until,1)
    RETURNING id,to_jsonb(sales_goals.*) INTO v_id,v_after;
  ELSE
    SELECT to_jsonb(sg) INTO v_before FROM public.sales_goals sg WHERE sg.tenant_id=v_tenant AND sg.id=p_goal_id FOR UPDATE;
    IF v_before IS NULL THEN RAISE EXCEPTION 'sales_not_found_or_out_of_scope' USING ERRCODE='P0002'; END IF;
    IF (v_before->>'revision')::bigint <> p_expected_revision THEN RAISE EXCEPTION 'sales_stale_revision' USING ERRCODE='40001', DETAIL=v_before::text; END IF;
    UPDATE public.sales_goals SET provisioning_key=COALESCE(provisioning_key,p_provisioning_key),name=btrim(p_name),scope=p_scope,target_value=p_target_value,commission_percent=p_commission_percent,sort_order=p_sort_order,is_challenge=p_is_challenge,is_active=p_is_active,valid_from=p_valid_from,valid_until=p_valid_until,revision=revision+1,updated_at=now() WHERE tenant_id=v_tenant AND id=p_goal_id RETURNING id,to_jsonb(sales_goals.*) INTO v_id,v_after;
    -- Re-sync das atribuições de período aberto; overrides prevalecem.
    UPDATE public.sales_goal_assignments sga SET
      target_value_snapshot=COALESCE(sga.target_override,p_target_value),
      commission_percent_snapshot=COALESCE(sga.commission_override,p_commission_percent),
      goal_name_snapshot=btrim(p_name),goal_scope_snapshot=p_scope,goal_sort_order_snapshot=p_sort_order,
      goal_is_challenge_snapshot=p_is_challenge,valid_from_snapshot=p_valid_from,valid_until_snapshot=p_valid_until,
      goal_revision=(v_after->>'revision')::bigint,revision=sga.revision+1,updated_at=now()
    FROM public.sales_periods sp WHERE sga.tenant_id=v_tenant AND sga.goal_id=p_goal_id AND sp.tenant_id=sga.tenant_id AND sp.id=sga.period_id AND sp.status='OPEN';
  END IF;
  INSERT INTO public.sales_audit_events(tenant_id,actor_id,action,entity_type,entity_id,details) VALUES(v_tenant,v_actor,'SALES_GOAL_VERSION_SET','sales_goal',v_id,jsonb_build_object('before',v_before,'after',v_after,'closed_assignments_preserved',true));
  RETURN v_after - 'tenant_id';
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'sales_duplicate_goal_identity' USING ERRCODE='23505';
END;
$$;

-- set_goal_assignment_v2: aceita target/comissão próprios por consultora.
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
  IF (v_goal.scope='INDIVIDUAL' AND (p_profile_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.sales_memberships sm WHERE sm.tenant_id=v_tenant AND sm.profile_id=p_profile_id AND sm.role='CONSULTANT' AND sm.is_active))) OR (v_goal.scope<>'INDIVIDUAL' AND p_profile_id IS NOT NULL) THEN RAISE EXCEPTION 'sales_ineligible_assignee' USING ERRCODE='23514'; END IF;

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

REVOKE EXECUTE ON FUNCTION public.sales_admin_set_goal_assignment_v2(uuid,uuid,uuid,uuid,boolean,numeric,numeric,bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_admin_set_goal_assignment_v2(uuid,uuid,uuid,uuid,boolean,numeric,numeric,bigint) TO authenticated;

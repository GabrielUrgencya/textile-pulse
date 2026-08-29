-- Rollback de 20260825180000_sales_goal_assignment_overrides
-- Restaura set_goal_v1 sem overrides, remove a v2 e as colunas.

CREATE OR REPLACE FUNCTION public.sales_admin_set_goal_v1(
  p_goal_id uuid, p_provisioning_key text, p_name text, p_scope public."SalesGoalScope", p_target_value numeric,
  p_commission_percent numeric, p_sort_order integer, p_is_challenge boolean, p_is_active boolean,
  p_valid_from date, p_valid_until date, p_expected_revision bigint
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE v_tenant uuid := public.auth_tenant_id(); v_actor uuid := auth.uid(); v_before jsonb; v_after jsonb; v_id uuid;
BEGIN
  IF v_tenant IS NULL OR v_actor IS NULL OR NOT public.sales_is_admin() THEN RAISE EXCEPTION 'sales_admin_required' USING ERRCODE='42501'; END IF;
  IF length(btrim(COALESCE(p_name,''))) NOT BETWEEN 1 AND 120 OR p_scope IS NULL OR p_target_value<0 OR p_commission_percent NOT BETWEEN 0 AND 100 OR p_sort_order<0 OR p_is_challenge IS NULL OR p_is_active IS NULL OR p_expected_revision IS NULL OR (p_valid_from IS NOT NULL AND p_valid_until IS NOT NULL AND p_valid_until<p_valid_from) THEN RAISE EXCEPTION 'sales_goal_validation' USING ERRCODE='22023'; END IF;
  IF p_provisioning_key IS NOT NULL AND (p_provisioning_key NOT IN('META_1','META_2','META_3','CHALLENGE','QUARTERLY','COLLECTIVE') OR (p_provisioning_key='COLLECTIVE')<>(p_scope='COLLECTIVE')) THEN RAISE EXCEPTION 'sales_goal_identity_scope_invalid' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant::text||':sales-goals',0));
  IF p_goal_id IS NULL THEN
    IF p_expected_revision<>0 THEN RAISE EXCEPTION 'sales_stale_revision' USING ERRCODE='40001'; END IF;
    INSERT INTO public.sales_goals(tenant_id,provisioning_key,name,scope,target_value,commission_percent,sort_order,is_challenge,is_active,valid_from,valid_until,revision)
    VALUES(v_tenant,p_provisioning_key,btrim(p_name),p_scope,p_target_value,p_commission_percent,p_sort_order,p_is_challenge,p_is_active,p_valid_from,p_valid_until,1)
    RETURNING id,to_jsonb(sales_goals.*) INTO v_id,v_after;
  ELSE
    SELECT to_jsonb(sg) INTO v_before FROM public.sales_goals sg WHERE sg.tenant_id=v_tenant AND sg.id=p_goal_id FOR UPDATE;
    IF v_before IS NULL THEN RAISE EXCEPTION 'sales_not_found_or_out_of_scope' USING ERRCODE='P0002'; END IF;
    IF (v_before->>'revision')::bigint<>p_expected_revision THEN RAISE EXCEPTION 'sales_stale_revision' USING ERRCODE='40001',DETAIL=v_before::text; END IF;
    UPDATE public.sales_goals SET provisioning_key=COALESCE(provisioning_key,p_provisioning_key),name=btrim(p_name),scope=p_scope,target_value=p_target_value,commission_percent=p_commission_percent,sort_order=p_sort_order,is_challenge=p_is_challenge,is_active=p_is_active,valid_from=p_valid_from,valid_until=p_valid_until,revision=revision+1,updated_at=now() WHERE tenant_id=v_tenant AND id=p_goal_id RETURNING id,to_jsonb(sales_goals.*) INTO v_id,v_after;
    UPDATE public.sales_goal_assignments sga SET target_value_snapshot=p_target_value,commission_percent_snapshot=p_commission_percent,goal_name_snapshot=btrim(p_name),goal_scope_snapshot=p_scope,goal_sort_order_snapshot=p_sort_order,goal_is_challenge_snapshot=p_is_challenge,valid_from_snapshot=p_valid_from,valid_until_snapshot=p_valid_until,goal_revision=(v_after->>'revision')::bigint,revision=sga.revision+1,updated_at=now()
    FROM public.sales_periods sp WHERE sga.tenant_id=v_tenant AND sga.goal_id=p_goal_id AND sp.tenant_id=sga.tenant_id AND sp.id=sga.period_id AND sp.status='OPEN';
  END IF;
  INSERT INTO public.sales_audit_events(tenant_id,actor_id,action,entity_type,entity_id,details) VALUES(v_tenant,v_actor,'SALES_GOAL_VERSION_SET','sales_goal',v_id,jsonb_build_object('before',v_before,'after',v_after,'closed_assignments_preserved',true));
  RETURN v_after-'tenant_id';
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'sales_duplicate_goal_identity' USING ERRCODE='23505';
END;
$$;

DROP FUNCTION IF EXISTS public.sales_admin_set_goal_assignment_v2(uuid,uuid,uuid,uuid,boolean,numeric,numeric,bigint);
ALTER TABLE public.sales_goal_assignments
  DROP CONSTRAINT IF EXISTS sales_goal_assignments_target_override_chk,
  DROP CONSTRAINT IF EXISTS sales_goal_assignments_commission_override_chk,
  DROP COLUMN IF EXISTS target_override,
  DROP COLUMN IF EXISTS commission_override;

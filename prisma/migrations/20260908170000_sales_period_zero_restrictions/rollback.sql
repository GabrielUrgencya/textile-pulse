-- rollback

CREATE OR REPLACE FUNCTION public.sales_admin_delete_period_v1(p_period_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_tenant uuid := public.auth_tenant_id(); v_actor uuid := auth.uid(); v_period public.sales_periods%ROWTYPE;
BEGIN
  IF v_tenant IS NULL OR v_actor IS NULL OR NOT public.sales_is_admin() THEN
    RAISE EXCEPTION 'sales_admin_required' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant::text || ':sales-periods', 0));
  SELECT * INTO v_period FROM public.sales_periods WHERE tenant_id = v_tenant AND id = p_period_id FOR UPDATE;
  IF v_period.id IS NULL THEN RAISE EXCEPTION 'sales_not_found_or_out_of_scope' USING ERRCODE = 'P0002'; END IF;
  -- Vendas reais protegem o periodo (qualquer status). Sem vendas => pode excluir, mesmo encerrado.
  IF EXISTS (SELECT 1 FROM public.sales s WHERE s.tenant_id = v_tenant AND s.period_id = p_period_id) THEN
    RAISE EXCEPTION 'sales_period_has_sales' USING ERRCODE = '23503';
  END IF;
  -- (1) Solta o vinculo "proximo periodo" de fechamentos anteriores (preserva o snapshot deles).
  UPDATE public.sales_period_closures c SET next_period_id = NULL
   WHERE c.tenant_id = v_tenant AND c.next_period_id = p_period_id;
  -- (2) Remove os pedidos de fechamento ligados ao closure DESTE periodo (period vazio => auditoria de baixo valor).
  DELETE FROM public.sales_period_close_requests r
   WHERE r.tenant_id = v_tenant
     AND r.closure_id IN (SELECT c.id FROM public.sales_period_closures c WHERE c.tenant_id = v_tenant AND c.period_id = p_period_id);
  -- (3) Remove o snapshot de fechamento do proprio periodo.
  DELETE FROM public.sales_period_closures c
   WHERE c.tenant_id = v_tenant AND c.period_id = p_period_id;
  -- (4) celebrations, goal_assignments e tv_kiosk_deliveries tem ON DELETE CASCADE.
  DELETE FROM public.sales_periods WHERE tenant_id = v_tenant AND id = p_period_id;
  INSERT INTO public.sales_audit_events (tenant_id, actor_id, action, entity_type, entity_id, details)
  VALUES (v_tenant, v_actor, 'SALES_PERIOD_DELETED', 'sales_period', p_period_id, jsonb_build_object('before', to_jsonb(v_period)));
  RETURN jsonb_build_object('id', p_period_id, 'deleted', true);
EXCEPTION WHEN foreign_key_violation THEN
  RAISE EXCEPTION 'sales_period_has_sales' USING ERRCODE = '23503';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sales_admin_set_period_v1(p_period_id uuid, p_starts_on date, p_ends_on date, p_expected_revision bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_tenant uuid:=public.auth_tenant_id();v_actor uuid:=auth.uid();v_before jsonb;v_after jsonb;v_id uuid;
BEGIN
 IF v_tenant IS NULL OR v_actor IS NULL OR NOT public.sales_is_admin() THEN RAISE EXCEPTION 'sales_admin_required' USING ERRCODE='42501';END IF;
 IF p_starts_on IS NULL OR p_ends_on IS NULL OR p_ends_on<p_starts_on OR p_expected_revision IS NULL THEN RAISE EXCEPTION 'sales_period_validation' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant::text||':sales-periods',0));
 IF p_period_id IS NOT NULL THEN SELECT to_jsonb(sp) INTO v_before FROM public.sales_periods sp WHERE sp.tenant_id=v_tenant AND sp.id=p_period_id FOR UPDATE; IF v_before IS NULL THEN RAISE EXCEPTION 'sales_not_found_or_out_of_scope' USING ERRCODE='P0002';END IF; IF v_before->>'status'='CLOSED' THEN RAISE EXCEPTION 'sales_closed_period_immutable' USING ERRCODE='25006';END IF; IF (v_before->>'revision')::bigint<>p_expected_revision THEN RAISE EXCEPTION 'sales_stale_revision' USING ERRCODE='40001',DETAIL=v_before::text;END IF; ELSIF p_expected_revision<>0 THEN RAISE EXCEPTION 'sales_stale_revision' USING ERRCODE='40001';END IF;
 IF EXISTS(SELECT 1 FROM public.sales_periods sp WHERE sp.tenant_id=v_tenant AND sp.id IS DISTINCT FROM p_period_id AND daterange(sp.starts_on,sp.ends_on,'[]')&&daterange(p_starts_on,p_ends_on,'[]')) THEN RAISE EXCEPTION 'sales_overlapping_period' USING ERRCODE='23P01';END IF;
 IF p_period_id IS NULL THEN INSERT INTO public.sales_periods(tenant_id,starts_on,ends_on,status,revision) VALUES(v_tenant,p_starts_on,p_ends_on,'OPEN',1) RETURNING id,to_jsonb(sales_periods.*) INTO v_id,v_after; ELSE UPDATE public.sales_periods SET starts_on=p_starts_on,ends_on=p_ends_on,revision=revision+1,updated_at=now() WHERE tenant_id=v_tenant AND id=p_period_id RETURNING id,to_jsonb(sales_periods.*) INTO v_id,v_after; END IF;
 INSERT INTO public.sales_audit_events(tenant_id,actor_id,action,entity_type,entity_id,details) VALUES(v_tenant,v_actor,'SALES_PERIOD_CONFIGURED','sales_period',v_id,jsonb_build_object('before',v_before,'after',v_after));
 RETURN (v_after-'tenant_id')||jsonb_build_object('read_only_reason',NULL);
END;
$function$
;

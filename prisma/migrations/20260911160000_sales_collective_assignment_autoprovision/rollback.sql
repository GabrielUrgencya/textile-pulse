-- rollback (nao remove atribuicoes ja criadas; restaura a funcao)

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
 -- (sobreposicao permitida: checagem removida a pedido do produto)
 IF p_period_id IS NULL THEN INSERT INTO public.sales_periods(tenant_id,starts_on,ends_on,status,revision) VALUES(v_tenant,p_starts_on,p_ends_on,'OPEN',1) RETURNING id,to_jsonb(sales_periods.*) INTO v_id,v_after; ELSE UPDATE public.sales_periods SET starts_on=p_starts_on,ends_on=p_ends_on,revision=revision+1,updated_at=now() WHERE tenant_id=v_tenant AND id=p_period_id RETURNING id,to_jsonb(sales_periods.*) INTO v_id,v_after; END IF;
 INSERT INTO public.sales_audit_events(tenant_id,actor_id,action,entity_type,entity_id,details) VALUES(v_tenant,v_actor,'SALES_PERIOD_CONFIGURED','sales_period',v_id,jsonb_build_object('before',v_before,'after',v_after));
 RETURN (v_after-'tenant_id')||jsonb_build_object('read_only_reason',NULL);
END;
$function$
;

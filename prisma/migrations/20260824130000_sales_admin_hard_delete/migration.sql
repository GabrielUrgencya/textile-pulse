-- D1: exclusão DEFINITIVA de venda pelo ADM (hard delete), além do cancelamento existente.
-- Mantém trilha de auditoria (grava o snapshot em sales_audit_events ANTES de deletar) e
-- idempotência via sales_mutation_requests. Só opera em período ABERTO (histórico é imutável).
-- Espelha os guards do sales_admin_cancel_sale_v2 (admin + tenant + revisão + lock).
BEGIN;

-- Estende o CHECK de operações para aceitar 'DELETE'.
ALTER TABLE public.sales_mutation_requests DROP CONSTRAINT IF EXISTS sales_mutation_requests_operation_check;
ALTER TABLE public.sales_mutation_requests ADD CONSTRAINT sales_mutation_requests_operation_check CHECK (operation IN ('UPSERT','CANCEL','DELETE'));

CREATE OR REPLACE FUNCTION public.sales_admin_delete_sale_v1(p_sale_id uuid,p_expected_revision bigint,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_tenant uuid:=public.auth_tenant_id();v_actor uuid:=auth.uid();v_key text:=btrim(COALESCE(p_idempotency_key,''));v_request jsonb;v_old_req jsonb;v_result jsonb;v_before jsonb;
BEGIN
 IF v_tenant IS NULL OR v_actor IS NULL OR NOT public.sales_is_admin() THEN RAISE EXCEPTION 'sales_admin_required' USING ERRCODE='42501';END IF;
 IF length(v_key) NOT BETWEEN 1 AND 200 OR p_expected_revision IS NULL THEN RAISE EXCEPTION 'sales_delete_validation' USING ERRCODE='22023';END IF;
 v_request:=jsonb_build_object('sale_id',p_sale_id,'revision',p_expected_revision);
 PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant::text||':sales:'||v_key,0));
 SELECT request,result INTO v_old_req,v_result FROM public.sales_mutation_requests WHERE tenant_id=v_tenant AND idempotency_key=v_key;
 IF v_result IS NOT NULL THEN IF v_old_req IS DISTINCT FROM v_request THEN RAISE EXCEPTION 'sales_idempotency_mismatch' USING ERRCODE='22023';END IF;RETURN v_result||jsonb_build_object('event_already_existed',true);END IF;
 SELECT to_jsonb(s)INTO v_before FROM public.sales s JOIN public.sales_periods sp ON sp.tenant_id=s.tenant_id AND sp.id=s.period_id WHERE s.tenant_id=v_tenant AND s.id=p_sale_id AND sp.status='OPEN' FOR UPDATE OF s;
 IF v_before IS NULL THEN RAISE EXCEPTION 'sales_closed_period_or_not_found' USING ERRCODE='25006';END IF;
 IF(v_before->>'revision')::bigint<>p_expected_revision THEN RAISE EXCEPTION 'sales_stale_revision' USING ERRCODE='40001',DETAIL=v_before::text;END IF;
 INSERT INTO public.sales_audit_events(tenant_id,actor_id,action,entity_type,entity_id,details)VALUES(v_tenant,v_actor,'SALE_DELETED','sale',p_sale_id,jsonb_build_object('before',v_before));
 DELETE FROM public.sales WHERE tenant_id=v_tenant AND id=p_sale_id;
 v_result:=jsonb_build_object('deleted',true,'sale',v_before-'tenant_id','event_already_existed',false,'revalidate',jsonb_build_array('dashboard','sales-list'));
 INSERT INTO public.sales_mutation_requests(tenant_id,idempotency_key,operation,request,result)VALUES(v_tenant,v_key,'DELETE',v_request,v_result);
 RETURN v_result;
END;$$;

REVOKE ALL ON FUNCTION public.sales_admin_delete_sale_v1(uuid,bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_admin_delete_sale_v1(uuid,bigint,text) TO authenticated;

COMMIT;

BEGIN;

DO $$
BEGIN
 IF pg_catalog.to_regprocedure('extensions.digest(bytea,text)') IS NULL THEN
  RAISE EXCEPTION 'sales_close_requires_extensions_digest_sha256';
 END IF;
END;$$;

ALTER TABLE public.sales_period_closures
  ADD COLUMN request jsonb,
  ADD COLUMN result jsonb,
  ADD COLUMN next_period_id uuid,
  ADD CONSTRAINT sales_period_closures_next_period_tenant_fk
    FOREIGN KEY (tenant_id,next_period_id) REFERENCES public.sales_periods(tenant_id,id) ON DELETE RESTRICT;

CREATE TABLE public.sales_period_close_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id)ON DELETE CASCADE,
 idempotency_key text NOT NULL CHECK(length(btrim(idempotency_key))BETWEEN 1 AND 200),request jsonb NOT NULL,result jsonb NOT NULL,
 closure_id uuid NOT NULL REFERENCES public.sales_period_closures(id)ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,idempotency_key)
);
ALTER TABLE public.sales_period_close_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_period_close_requests FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.sales_period_closure_immutable_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.request IS DISTINCT FROM OLD.request OR NEW.result IS DISTINCT FROM OLD.result OR NEW.period_id IS DISTINCT FROM OLD.period_id OR NEW.next_period_id IS DISTINCT FROM OLD.next_period_id OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key THEN
  RAISE EXCEPTION 'sales_period_closure_immutable' USING ERRCODE='25006';
 END IF;
 RETURN NEW;
END;$$;
REVOKE ALL ON FUNCTION public.sales_period_closure_immutable_v1() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER sales_period_closure_immutable_v1_trigger BEFORE UPDATE ON public.sales_period_closures FOR EACH ROW EXECUTE FUNCTION public.sales_period_closure_immutable_v1();

CREATE OR REPLACE FUNCTION public.sales_close_material_write_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_tenant uuid;v_period uuid;v_old_period uuid;
BEGIN
 IF TG_TABLE_NAME='sales_holidays' AND TG_OP='UPDATE' AND OLD.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(LEAST(OLD.tenant_id,NEW.tenant_id)::text||':sales-period-close',0));
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(GREATEST(OLD.tenant_id,NEW.tenant_id)::text||':sales-period-close',0));
  v_tenant:=NEW.tenant_id;
 ELSIF TG_OP='DELETE' THEN
  v_tenant:=OLD.tenant_id;
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(v_tenant::text||':sales-period-close',0));
 ELSE
  v_tenant:=NEW.tenant_id;
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(v_tenant::text||':sales-period-close',0));
 END IF;
 IF TG_TABLE_NAME IN('sales','sales_goal_assignments','sales_celebrations') THEN
  v_period:=CASE WHEN TG_OP='DELETE' THEN OLD.period_id ELSE NEW.period_id END;
  v_old_period:=CASE WHEN TG_OP='UPDATE' THEN OLD.period_id ELSE v_period END;
  IF NOT EXISTS(SELECT 1 FROM public.sales_periods sp WHERE sp.tenant_id=v_tenant AND sp.id=v_period AND sp.status='OPEN')
     OR NOT EXISTS(SELECT 1 FROM public.sales_periods sp WHERE sp.tenant_id=v_tenant AND sp.id=v_old_period AND sp.status='OPEN') THEN
   RAISE EXCEPTION 'sales_closed_period_or_not_found' USING ERRCODE='25006';
  END IF;
 END IF;
 IF TG_TABLE_NAME='sales_holidays' THEN
  IF TG_OP='INSERT' THEN
   IF EXISTS(SELECT 1 FROM public.sales_periods sp WHERE sp.tenant_id=NEW.tenant_id AND sp.status='CLOSED' AND NEW.date BETWEEN sp.starts_on AND sp.ends_on) THEN RAISE EXCEPTION 'sales_closed_period_immutable' USING ERRCODE='25006';END IF;
  ELSIF TG_OP='UPDATE' THEN
   IF EXISTS(SELECT 1 FROM public.sales_periods sp WHERE sp.tenant_id=NEW.tenant_id AND sp.status='CLOSED' AND NEW.date BETWEEN sp.starts_on AND sp.ends_on)
      OR EXISTS(SELECT 1 FROM public.sales_periods sp WHERE sp.tenant_id=OLD.tenant_id AND sp.status='CLOSED' AND OLD.date BETWEEN sp.starts_on AND sp.ends_on) THEN RAISE EXCEPTION 'sales_closed_period_immutable' USING ERRCODE='25006';END IF;
  ELSE
   IF EXISTS(SELECT 1 FROM public.sales_periods sp WHERE sp.tenant_id=OLD.tenant_id AND sp.status='CLOSED' AND OLD.date BETWEEN sp.starts_on AND sp.ends_on) THEN RAISE EXCEPTION 'sales_closed_period_immutable' USING ERRCODE='25006';END IF;
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;
 RETURN NEW;
END;$$;
REVOKE ALL ON FUNCTION public.sales_close_material_write_guard_v1() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER sales_close_guard_sales BEFORE INSERT OR UPDATE OR DELETE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.sales_close_material_write_guard_v1();
CREATE TRIGGER sales_close_guard_config BEFORE INSERT OR UPDATE OR DELETE ON public.sales_config FOR EACH ROW EXECUTE FUNCTION public.sales_close_material_write_guard_v1();
CREATE TRIGGER sales_close_guard_assignments BEFORE INSERT OR UPDATE OR DELETE ON public.sales_goal_assignments FOR EACH ROW EXECUTE FUNCTION public.sales_close_material_write_guard_v1();
CREATE TRIGGER sales_close_guard_holidays BEFORE INSERT OR UPDATE OR DELETE ON public.sales_holidays FOR EACH ROW EXECUTE FUNCTION public.sales_close_material_write_guard_v1();
CREATE TRIGGER sales_close_guard_celebrations BEFORE INSERT OR UPDATE OR DELETE ON public.sales_celebrations FOR EACH ROW EXECUTE FUNCTION public.sales_close_material_write_guard_v1();

CREATE OR REPLACE FUNCTION public.sales_close_preview_revision_v1(p_tenant_id uuid,p_period_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $$
 SELECT encode(extensions.digest(convert_to(jsonb_build_object(
  'as_of',(now() AT TIME ZONE COALESCE((SELECT sc.timezone FROM public.sales_config sc WHERE sc.tenant_id=p_tenant_id),'America/Sao_Paulo'))::date,
  'period',(SELECT jsonb_build_object('id',sp.id,'starts_on',sp.starts_on,'ends_on',sp.ends_on,'status',sp.status,'closed_at',sp.closed_at,'revision',sp.revision) FROM public.sales_periods sp WHERE sp.tenant_id=p_tenant_id AND sp.id=p_period_id),
  'sales',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',s.id,'period_id',s.period_id,'consultant_profile_id',s.consultant_profile_id,'pv_number',s.pv_number,'sale_value',s.sale_value,'freight_value',s.freight_value,'discount_value',s.discount_value,'payment_method_id',s.payment_method_id,'installments',s.installments,'sets_count',s.sets_count,'loose_pieces_count',s.loose_pieces_count,'pieces_total',s.pieces_total,'invoice_number',s.invoice_number,'status',s.status,'sold_at',s.sold_at,'cancelled_at',s.cancelled_at,'cancelled_by_id',s.cancelled_by_id,'cancellation_reason',s.cancellation_reason,'revision',s.revision) ORDER BY s.id),'[]'::jsonb) FROM public.sales s WHERE s.tenant_id=p_tenant_id AND s.period_id=p_period_id),
  'config',(SELECT COALESCE(jsonb_build_object('id',sc.id,'pieces_per_set',sc.pieces_per_set,'timezone',sc.timezone,'week_starts_on',sc.week_starts_on,'allow_team_aggregates',sc.allow_team_aggregates,'revision',sc.revision),'null'::jsonb) FROM (SELECT 1) q LEFT JOIN public.sales_config sc ON sc.tenant_id=p_tenant_id),
  'assignments',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',sga.id,'goal_id',sga.goal_id,'period_id',sga.period_id,'profile_id',sga.profile_id,'target_value_snapshot',sga.target_value_snapshot,'commission_percent_snapshot',sga.commission_percent_snapshot,'goal_name_snapshot',sga.goal_name_snapshot,'goal_scope_snapshot',sga.goal_scope_snapshot,'goal_sort_order_snapshot',sga.goal_sort_order_snapshot,'goal_is_challenge_snapshot',sga.goal_is_challenge_snapshot,'valid_from_snapshot',sga.valid_from_snapshot,'valid_until_snapshot',sga.valid_until_snapshot,'goal_revision',sga.goal_revision,'is_active',sga.is_active,'revision',sga.revision) ORDER BY sga.id),'[]'::jsonb) FROM public.sales_goal_assignments sga WHERE sga.tenant_id=p_tenant_id AND sga.period_id=p_period_id),
  'holidays',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',sh.id,'date',sh.date,'name',sh.name,'is_active',sh.is_active,'revision',sh.revision) ORDER BY sh.date,sh.id),'[]'::jsonb) FROM public.sales_holidays sh JOIN public.sales_periods sp ON sp.tenant_id=sh.tenant_id AND sp.id=p_period_id WHERE sh.tenant_id=p_tenant_id AND sh.is_active AND sh.date BETWEEN sp.starts_on AND sp.ends_on)
 )::text,'UTF8'),'sha256'),'hex');
$$;
REVOKE ALL ON FUNCTION public.sales_close_preview_revision_v1(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.sales_close_preview_v2(p_period_id uuid,p_next_starts_on date,p_next_ends_on date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_tenant uuid:=public.auth_tenant_id();v_period public.sales_periods%ROWTYPE;v_metrics jsonb;v_existing uuid;v_existing_status public."SalesPeriodStatus";v_overlap jsonb;v_next_blocker jsonb:='[]'::jsonb;v_blockers jsonb;v_preview_revision text;
BEGIN
 IF v_tenant IS NULL OR auth.uid() IS NULL OR NOT public.sales_is_admin() THEN RAISE EXCEPTION 'sales_admin_required' USING ERRCODE='42501';END IF;
 IF p_period_id IS NULL OR p_next_starts_on IS NULL OR p_next_ends_on IS NULL OR p_next_ends_on<p_next_starts_on THEN RAISE EXCEPTION 'sales_close_validation' USING ERRCODE='22023';END IF;
 SELECT * INTO v_period FROM public.sales_periods sp WHERE sp.tenant_id=v_tenant AND sp.id=p_period_id;
 IF v_period.id IS NULL THEN RAISE EXCEPTION 'sales_not_found_or_out_of_scope' USING ERRCODE='P0002';END IF;
 IF p_next_starts_on<=v_period.ends_on THEN RAISE EXCEPTION 'sales_next_period_must_follow_current' USING ERRCODE='22023';END IF;
 IF v_period.status='CLOSED' THEN RETURN(SELECT COALESCE(spc.result,jsonb_build_object('closed_period_id',spc.period_id,'closure_id',spc.id,'snapshot',spc.snapshot,'next_period_id',spc.next_period_id,'outcome','replayed'))FROM public.sales_period_closures spc WHERE spc.tenant_id=v_tenant AND spc.period_id=p_period_id);END IF;
 SELECT sp.id,sp.status INTO v_existing,v_existing_status FROM public.sales_periods sp WHERE sp.tenant_id=v_tenant AND sp.id<>p_period_id AND sp.starts_on=p_next_starts_on AND sp.ends_on=p_next_ends_on;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('code','sales_overlapping_period','period_id',sp.id,'starts_on',sp.starts_on,'ends_on',sp.ends_on,'status',sp.status)),'[]'::jsonb) INTO v_overlap FROM public.sales_periods sp WHERE sp.tenant_id=v_tenant AND sp.id<>p_period_id AND sp.id IS DISTINCT FROM v_existing AND daterange(sp.starts_on,sp.ends_on,'[]')&&daterange(p_next_starts_on,p_next_ends_on,'[]');
 IF v_existing IS NOT NULL AND (v_existing_status<>'OPEN' OR EXISTS(SELECT 1 FROM public.sales s WHERE s.tenant_id=v_tenant AND s.period_id=v_existing) OR EXISTS(SELECT 1 FROM public.sales_period_closures spc WHERE spc.tenant_id=v_tenant AND (spc.period_id=v_existing OR spc.next_period_id=v_existing)) OR EXISTS(SELECT 1 FROM public.sales_celebrations sce WHERE sce.tenant_id=v_tenant AND sce.period_id=v_existing)) THEN v_next_blocker:=jsonb_build_array(jsonb_build_object('code','sales_next_period_not_empty','period_id',v_existing));END IF;
 v_blockers:=v_overlap||v_next_blocker;
 v_metrics:=public.sales_metrics_internal_v1(v_tenant,p_period_id,NULL,NULL);
 v_preview_revision:=public.sales_close_preview_revision_v1(v_tenant,p_period_id);
 RETURN jsonb_build_object('period_id',p_period_id,'period_revision',v_preview_revision,'period',jsonb_build_object('starts_on',v_period.starts_on,'ends_on',v_period.ends_on,'status',v_period.status),'summary',v_metrics,'next_period',jsonb_build_object('mode',CASE WHEN v_existing IS NULL THEN'proposed'ELSE'existing'END,'id',v_existing,'starts_on',p_next_starts_on,'ends_on',p_next_ends_on),'blockers',v_blockers,'can_close',jsonb_array_length(v_blockers)=0);
END;$$;

CREATE OR REPLACE FUNCTION public.sales_close_period_v2(p_period_id uuid,p_expected_revision text,p_next_starts_on date,p_next_ends_on date,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_tenant uuid:=public.auth_tenant_id();v_actor uuid:=auth.uid();v_key text:=btrim(COALESCE(p_idempotency_key,''));v_req jsonb;v_old_req jsonb;v_old_result jsonb;v_period public.sales_periods%ROWTYPE;v_next uuid;v_next_status public."SalesPeriodStatus";v_closure uuid;v_snapshot jsonb;v_result jsonb;v_metrics jsonb;v_next_progress jsonb;v_actual_revision text;v_created boolean:=false;
BEGIN
 IF v_tenant IS NULL OR v_actor IS NULL OR NOT public.sales_is_admin() THEN RAISE EXCEPTION 'sales_admin_required' USING ERRCODE='42501';END IF;
 IF p_period_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision!~'^[0-9a-f]{64}$' OR p_next_starts_on IS NULL OR p_next_ends_on IS NULL OR p_next_ends_on<p_next_starts_on OR length(v_key)NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'sales_close_validation' USING ERRCODE='22023';END IF;
 v_req:=jsonb_build_object('period_id',p_period_id,'expected_revision',p_expected_revision,'next_starts_on',p_next_starts_on,'next_ends_on',p_next_ends_on);
 PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant::text||':sales-periods',0));
 SELECT * INTO v_period FROM public.sales_periods sp WHERE sp.tenant_id=v_tenant AND sp.id=p_period_id FOR UPDATE;
 IF v_period.id IS NULL THEN RAISE EXCEPTION 'sales_not_found_or_out_of_scope' USING ERRCODE='P0002';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant::text||':sales-period-close',0));
 SELECT request,result INTO v_old_req,v_old_result FROM public.sales_period_close_requests WHERE tenant_id=v_tenant AND idempotency_key=v_key;
 IF v_old_result IS NOT NULL THEN IF v_old_req IS DISTINCT FROM v_req THEN RAISE EXCEPTION 'sales_idempotency_mismatch' USING ERRCODE='22023';END IF;RETURN v_old_result||jsonb_build_object('outcome','replayed');END IF;
 IF p_next_starts_on<=v_period.ends_on THEN RAISE EXCEPTION 'sales_next_period_must_follow_current' USING ERRCODE='22023';END IF;
 SELECT id,result INTO v_closure,v_old_result FROM public.sales_period_closures WHERE tenant_id=v_tenant AND period_id=p_period_id;
 IF v_closure IS NOT NULL THEN v_result:=COALESCE(v_old_result,(SELECT jsonb_build_object('closed_period_id',period_id,'closure_id',id,'snapshot',snapshot,'next_period_id',next_period_id)FROM public.sales_period_closures WHERE id=v_closure))||jsonb_build_object('outcome','converged');INSERT INTO public.sales_period_close_requests(tenant_id,idempotency_key,request,result,closure_id)VALUES(v_tenant,v_key,v_req,v_result,v_closure);RETURN v_result;END IF;
 IF v_period.status<>'OPEN' THEN RAISE EXCEPTION 'sales_period_already_closed' USING ERRCODE='25006';END IF;
 v_actual_revision:=public.sales_close_preview_revision_v1(v_tenant,p_period_id);
 IF v_actual_revision<>p_expected_revision THEN RAISE EXCEPTION 'sales_stale_preview' USING ERRCODE='40001',DETAIL=jsonb_build_object('period_id',p_period_id,'actual_revision',v_actual_revision)::text;END IF;
 SELECT sp.id,sp.status INTO v_next,v_next_status FROM public.sales_periods sp WHERE sp.tenant_id=v_tenant AND sp.id<>p_period_id AND sp.starts_on=p_next_starts_on AND sp.ends_on=p_next_ends_on FOR UPDATE;
 IF v_next IS NOT NULL AND (v_next_status<>'OPEN' OR EXISTS(SELECT 1 FROM public.sales s WHERE s.tenant_id=v_tenant AND s.period_id=v_next) OR EXISTS(SELECT 1 FROM public.sales_period_closures spc WHERE spc.tenant_id=v_tenant AND (spc.period_id=v_next OR spc.next_period_id=v_next)) OR EXISTS(SELECT 1 FROM public.sales_celebrations sce WHERE sce.tenant_id=v_tenant AND sce.period_id=v_next)) THEN RAISE EXCEPTION 'sales_next_period_not_empty' USING ERRCODE='23514';END IF;
 IF EXISTS(SELECT 1 FROM public.sales_periods sp WHERE sp.tenant_id=v_tenant AND sp.id<>p_period_id AND sp.id IS DISTINCT FROM v_next AND daterange(sp.starts_on,sp.ends_on,'[]')&&daterange(p_next_starts_on,p_next_ends_on,'[]')) THEN RAISE EXCEPTION 'sales_overlapping_period' USING ERRCODE='23P01';END IF;
 v_metrics:=public.sales_metrics_internal_v1(v_tenant,p_period_id,NULL,NULL);
 SELECT jsonb_build_object('schema_version',2,'period',jsonb_build_object('id',v_period.id,'starts_on',v_period.starts_on,'ends_on',v_period.ends_on,'revision',v_period.revision),'metrics',v_metrics,'sales_by_status',(SELECT COALESCE(jsonb_agg(jsonb_build_object('status',q.status,'count',q.count,'value',q.value,'pieces',q.pieces,'freight',q.freight,'discount',q.discount)ORDER BY q.status),'[]')FROM(SELECT s.status,count(*)count,COALESCE(sum(s.sale_value),0)value,COALESCE(sum(s.pieces_total),0)pieces,COALESCE(sum(s.freight_value),0)freight,COALESCE(sum(s.discount_value),0)discount FROM public.sales s WHERE s.tenant_id=v_tenant AND s.period_id=p_period_id GROUP BY s.status)q),'config',(SELECT to_jsonb(sc)-'tenant_id' FROM public.sales_config sc WHERE sc.tenant_id=v_tenant),'assignments',(SELECT COALESCE(jsonb_agg(to_jsonb(sga)-'tenant_id' ORDER BY sga.goal_sort_order_snapshot,sga.id),'[]')FROM public.sales_goal_assignments sga WHERE sga.tenant_id=v_tenant AND sga.period_id=p_period_id)) INTO v_snapshot;
 IF v_next IS NULL THEN INSERT INTO public.sales_periods(tenant_id,starts_on,ends_on,status,revision)VALUES(v_tenant,p_next_starts_on,p_next_ends_on,'OPEN',1)RETURNING id INTO v_next;v_created:=true;END IF;
 v_next_progress:=public.sales_metrics_internal_v1(v_tenant,v_next,NULL,NULL);
 IF COALESCE((v_next_progress->>'realized_value')::numeric,0)<>0 OR COALESCE((v_next_progress->>'sales_count')::bigint,0)<>0 OR COALESCE((v_next_progress->>'pieces_total')::bigint,0)<>0 OR COALESCE((v_next_progress->>'commission_value')::numeric,0)<>0 THEN RAISE EXCEPTION 'sales_next_period_not_empty' USING ERRCODE='23514';END IF;
 v_closure:=gen_random_uuid();v_result:=jsonb_build_object('closed_period_id',p_period_id,'closure_id',v_closure,'snapshot',v_snapshot,'next_period_id',v_next,'next_period_created',v_created,'closed_at',now(),'outcome','created','next_period_progress',v_next_progress);
 INSERT INTO public.sales_period_closures(id,tenant_id,period_id,closed_by_id,snapshot,idempotency_key,request,result,next_period_id)VALUES(v_closure,v_tenant,p_period_id,v_actor,v_snapshot,v_key,v_req,v_result,v_next);
 INSERT INTO public.sales_period_close_requests(tenant_id,idempotency_key,request,result,closure_id)VALUES(v_tenant,v_key,v_req,v_result,v_closure);
 UPDATE public.sales_periods SET status='CLOSED',closed_at=now(),revision=revision+1,updated_at=now()WHERE tenant_id=v_tenant AND id=p_period_id;
 INSERT INTO public.sales_audit_events(tenant_id,actor_id,action,entity_type,entity_id,details)VALUES(v_tenant,v_actor,'PERIOD_CLOSED_V2','sales_period',p_period_id,jsonb_build_object('before',to_jsonb(v_period),'after',jsonb_build_object('status','CLOSED','next_period_id',v_next),'closure_id',v_closure,'idempotency_key_hash',md5(v_key)));
 RETURN v_result;
END;$$;

CREATE OR REPLACE FUNCTION public.sales_close_recovery_v1(p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_tenant uuid:=public.auth_tenant_id();v_result jsonb;
BEGIN
 IF v_tenant IS NULL OR auth.uid() IS NULL OR NOT public.sales_is_admin() THEN RAISE EXCEPTION 'sales_admin_required' USING ERRCODE='42501';END IF;
 SELECT result INTO v_result FROM public.sales_period_close_requests WHERE tenant_id=v_tenant AND idempotency_key=btrim(p_idempotency_key);
 RETURN CASE WHEN v_result IS NULL THEN jsonb_build_object('status','failed-before-commit') ELSE jsonb_build_object('status','committed','result',v_result||jsonb_build_object('outcome','replayed')) END;
END;$$;

ALTER FUNCTION public.sales_close_period_v1(uuid,text) RENAME TO sales_close_period_legacy_10_1;
REVOKE EXECUTE ON FUNCTION public.sales_close_period_legacy_10_1(uuid,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.sales_close_period_v1(p_period_id uuid,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_period public.sales_periods%ROWTYPE;v_result jsonb;v_days integer;
BEGIN
 SELECT * INTO v_period FROM public.sales_periods WHERE tenant_id=public.auth_tenant_id() AND id=p_period_id;
 IF v_period.id IS NULL THEN RAISE EXCEPTION 'sales_not_found_or_out_of_scope' USING ERRCODE='P0002';END IF;
 v_days:=v_period.ends_on-v_period.starts_on;
 v_result:=public.sales_close_period_v2(p_period_id,public.sales_close_preview_revision_v1(public.auth_tenant_id(),p_period_id),v_period.ends_on+1,v_period.ends_on+1+v_days,p_idempotency_key);
 RETURN v_result->'snapshot';
END;$$;

REVOKE EXECUTE ON FUNCTION public.sales_close_preview_v2(uuid,date,date),public.sales_close_period_v2(uuid,text,date,date,text),public.sales_close_recovery_v1(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_close_preview_v2(uuid,date,date),public.sales_close_period_v2(uuid,text,date,date,text),public.sales_close_recovery_v1(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.sales_close_period_v1(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_close_period_v1(uuid,text) TO authenticated;

COMMIT;

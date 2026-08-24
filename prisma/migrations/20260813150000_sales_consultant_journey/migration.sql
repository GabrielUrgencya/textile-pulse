BEGIN;

CREATE OR REPLACE FUNCTION public.sales_consultant_upsert_sale_v1(
 p_sale_id uuid,p_pv_number text,p_sale_value numeric,p_freight_value numeric,p_discount_value numeric,
 p_payment_method_id uuid,p_installments integer,p_sets_count integer,p_loose_pieces_count integer,
 p_invoice_number text,p_status public."SalesSaleStatus",p_sold_at timestamptz,
 p_expected_revision bigint,p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
 v_tenant uuid:=public.auth_tenant_id();v_actor uuid:=auth.uid();v_key text:=btrim(COALESCE(p_idempotency_key,''));
 v_request jsonb;v_old_request jsonb;v_result jsonb;v_before jsonb;v_after jsonb;v_period uuid;v_pieces_per_set integer;
BEGIN
 IF v_tenant IS NULL OR v_actor IS NULL OR public.sales_membership_role() IS DISTINCT FROM 'CONSULTANT' THEN RAISE EXCEPTION 'sales_consultant_required' USING ERRCODE='42501';END IF;
 IF length(v_key)NOT BETWEEN 16 AND 200 OR length(btrim(COALESCE(p_pv_number,'')))=0 OR p_sale_value IS NULL OR p_sale_value<0 OR COALESCE(p_freight_value,0)<0 OR COALESCE(p_discount_value,0)<0 OR COALESCE(p_discount_value,0)>p_sale_value OR p_payment_method_id IS NULL OR COALESCE(p_installments,0)<1 OR COALESCE(p_sets_count,-1)<0 OR COALESCE(p_loose_pieces_count,-1)<0 OR p_status IS NULL OR p_status NOT IN('OPEN','CLOSED') OR p_sold_at IS NULL OR p_expected_revision IS NULL THEN RAISE EXCEPTION 'sales_validation' USING ERRCODE='22023';END IF;
 v_request:=jsonb_build_object('actor_id',v_actor,'sale_id',p_sale_id,'pv_number',btrim(p_pv_number),'sale_value',p_sale_value,'freight_value',COALESCE(p_freight_value,0),'discount_value',COALESCE(p_discount_value,0),'payment_method_id',p_payment_method_id,'installments',p_installments,'sets_count',p_sets_count,'loose_pieces_count',p_loose_pieces_count,'invoice_number',NULLIF(btrim(p_invoice_number),''),'status',p_status,'sold_at',p_sold_at,'expected_revision',p_expected_revision);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_tenant::text||':sales:'||v_key,0));
 SELECT smr.request,smr.result INTO v_old_request,v_result FROM public.sales_mutation_requests smr WHERE smr.tenant_id=v_tenant AND smr.idempotency_key=v_key;
 IF v_result IS NOT NULL THEN IF v_old_request IS DISTINCT FROM v_request THEN RAISE EXCEPTION 'sales_idempotency_mismatch' USING ERRCODE='22023';END IF;RETURN v_result||jsonb_build_object('outcome','replayed');END IF;
 SELECT sp.id INTO v_period FROM public.sales_periods sp LEFT JOIN public.sales_config sc ON sc.tenant_id=sp.tenant_id WHERE sp.tenant_id=v_tenant AND sp.status='OPEN' AND (p_sold_at AT TIME ZONE COALESCE(sc.timezone,'America/Sao_Paulo'))::date BETWEEN sp.starts_on AND sp.ends_on ORDER BY sp.starts_on DESC LIMIT 1 FOR UPDATE OF sp;
 IF v_period IS NULL THEN RAISE EXCEPTION 'sales_closed_period_or_not_found' USING ERRCODE='25006';END IF;
 IF p_payment_method_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.sales_payment_methods pm WHERE pm.tenant_id=v_tenant AND pm.id=p_payment_method_id AND pm.is_active) THEN RAISE EXCEPTION 'sales_payment_method_inactive_or_not_found' USING ERRCODE='23503';END IF;
 SELECT COALESCE(sc.pieces_per_set,2) INTO v_pieces_per_set FROM(SELECT 1)q LEFT JOIN public.sales_config sc ON sc.tenant_id=v_tenant;
 IF p_sale_id IS NULL THEN
  IF p_expected_revision<>0 THEN RAISE EXCEPTION 'sales_stale_revision' USING ERRCODE='40001';END IF;
  INSERT INTO public.sales(tenant_id,period_id,consultant_profile_id,pv_number,sale_value,freight_value,discount_value,payment_method_id,installments,sets_count,loose_pieces_count,pieces_total,invoice_number,status,sold_at,revision)
  VALUES(v_tenant,v_period,v_actor,btrim(p_pv_number),p_sale_value,COALESCE(p_freight_value,0),COALESCE(p_discount_value,0),p_payment_method_id,p_installments,p_sets_count,p_loose_pieces_count,p_sets_count*v_pieces_per_set+p_loose_pieces_count,NULLIF(btrim(p_invoice_number),''),p_status,p_sold_at,1)
  RETURNING to_jsonb(sales.*) INTO v_after;
 ELSE
  SELECT to_jsonb(s) INTO v_before FROM public.sales s JOIN public.sales_periods sp ON sp.tenant_id=s.tenant_id AND sp.id=s.period_id WHERE s.tenant_id=v_tenant AND s.id=p_sale_id AND s.consultant_profile_id=v_actor AND s.status IN('OPEN','CLOSED') AND sp.status='OPEN' FOR UPDATE OF s;
  IF v_before IS NULL THEN RAISE EXCEPTION 'sales_sale_not_found_or_locked' USING ERRCODE='P0002';END IF;
  IF(v_before->>'revision')::bigint<>p_expected_revision THEN RAISE EXCEPTION 'sales_stale_revision' USING ERRCODE='40001';END IF;
  UPDATE public.sales SET period_id=v_period,pv_number=btrim(p_pv_number),sale_value=p_sale_value,freight_value=COALESCE(p_freight_value,0),discount_value=COALESCE(p_discount_value,0),payment_method_id=p_payment_method_id,installments=p_installments,sets_count=p_sets_count,loose_pieces_count=p_loose_pieces_count,pieces_total=p_sets_count*v_pieces_per_set+p_loose_pieces_count,invoice_number=NULLIF(btrim(p_invoice_number),''),status=p_status,sold_at=p_sold_at,revision=revision+1,updated_at=now() WHERE tenant_id=v_tenant AND id=p_sale_id AND consultant_profile_id=v_actor RETURNING to_jsonb(sales.*) INTO v_after;
 END IF;
 SELECT (v_after-'tenant_id')||jsonb_build_object('payment_method',CASE WHEN pm.id IS NULL THEN NULL ELSE jsonb_build_object('id',pm.id,'name',pm.name)END,'period',jsonb_build_object('id',sp.id,'starts_on',sp.starts_on,'ends_on',sp.ends_on,'status',sp.status),'can_edit',sp.status='OPEN' AND v_after->>'status'<>'CANCELLED') INTO v_after FROM public.sales_periods sp LEFT JOIN public.sales_payment_methods pm ON pm.tenant_id=v_tenant AND pm.id=(v_after->>'payment_method_id')::uuid WHERE sp.tenant_id=v_tenant AND sp.id=(v_after->>'period_id')::uuid;
 INSERT INTO public.sales_audit_events(tenant_id,actor_id,action,entity_type,entity_id,details)VALUES(v_tenant,v_actor,CASE WHEN p_sale_id IS NULL THEN'SALE_CREATED'ELSE'SALE_UPDATED'END,'sale',(v_after->>'id')::uuid,jsonb_build_object('before',v_before,'after',v_after,'source','CONSULTANT'));
 v_result:=jsonb_build_object('sale',v_after,'outcome',CASE WHEN p_sale_id IS NULL THEN'created'ELSE'updated'END,'revalidate',jsonb_build_array('consultant-dashboard','consultant-sales','consultant-sale-detail'));
 INSERT INTO public.sales_mutation_requests(tenant_id,idempotency_key,operation,request,result)VALUES(v_tenant,v_key,'UPSERT',v_request,v_result);
 RETURN v_result;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'sales_duplicate_pv' USING ERRCODE='23505';
END;$$;

CREATE OR REPLACE FUNCTION public.sales_consultant_list_sales_v1(p_period_id uuid DEFAULT NULL,p_month integer DEFAULT NULL,p_year integer DEFAULT NULL,p_status public."SalesSaleStatus" DEFAULT NULL,p_page integer DEFAULT 1,p_page_size integer DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_tenant uuid:=public.auth_tenant_id();v_actor uuid:=auth.uid();v_timezone text;v_total bigint;v_items jsonb;
BEGIN
 IF v_tenant IS NULL OR v_actor IS NULL OR public.sales_membership_role() IS DISTINCT FROM 'CONSULTANT' THEN RAISE EXCEPTION 'sales_consultant_required' USING ERRCODE='42501';END IF;
 IF(p_month IS NOT NULL AND p_month NOT BETWEEN 1 AND 12)OR(p_year IS NOT NULL AND p_year NOT BETWEEN 2000 AND 2200)OR p_page<1 OR p_page_size NOT BETWEEN 1 AND 100 OR p_status='CANCELLED' THEN RAISE EXCEPTION 'sales_filter_validation' USING ERRCODE='22023';END IF;
 IF p_period_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.sales_periods sp WHERE sp.tenant_id=v_tenant AND sp.id=p_period_id) THEN RAISE EXCEPTION 'sales_not_found_or_out_of_scope' USING ERRCODE='P0002';END IF;
 SELECT COALESCE(sc.timezone,'America/Sao_Paulo') INTO v_timezone FROM(SELECT 1)q LEFT JOIN public.sales_config sc ON sc.tenant_id=v_tenant;
 SELECT count(*) INTO v_total FROM public.sales s WHERE s.tenant_id=v_tenant AND s.consultant_profile_id=v_actor AND s.status IN('OPEN','CLOSED') AND(p_period_id IS NULL OR s.period_id=p_period_id)AND(p_month IS NULL OR extract(month FROM s.sold_at AT TIME ZONE v_timezone)=p_month)AND(p_year IS NULL OR extract(year FROM s.sold_at AT TIME ZONE v_timezone)=p_year)AND(p_status IS NULL OR s.status=p_status);
 SELECT COALESCE(jsonb_agg(to_jsonb(x)ORDER BY x.sold_at DESC,x.id),'[]'::jsonb)INTO v_items FROM(SELECT s.id,s.pv_number,s.sale_value,s.freight_value,s.discount_value,s.payment_method_id,pm.name payment_method_name,s.installments,s.sets_count,s.loose_pieces_count,s.pieces_total,s.invoice_number,s.status,s.sold_at,s.revision,s.period_id,sp.status period_status,sp.starts_on,sp.ends_on,sp.status='OPEN' can_edit FROM public.sales s JOIN public.sales_periods sp ON sp.tenant_id=s.tenant_id AND sp.id=s.period_id LEFT JOIN public.sales_payment_methods pm ON pm.tenant_id=s.tenant_id AND pm.id=s.payment_method_id WHERE s.tenant_id=v_tenant AND s.consultant_profile_id=v_actor AND s.status IN('OPEN','CLOSED')AND(p_period_id IS NULL OR s.period_id=p_period_id)AND(p_month IS NULL OR extract(month FROM s.sold_at AT TIME ZONE v_timezone)=p_month)AND(p_year IS NULL OR extract(year FROM s.sold_at AT TIME ZONE v_timezone)=p_year)AND(p_status IS NULL OR s.status=p_status)ORDER BY s.sold_at DESC,s.id LIMIT p_page_size OFFSET(p_page-1)*p_page_size)x;
 RETURN jsonb_build_object('items',v_items,'page',p_page,'page_size',p_page_size,'total',v_total,'filters',jsonb_build_object('period_id',p_period_id,'month',p_month,'year',p_year,'status',p_status));
END;$$;

CREATE OR REPLACE FUNCTION public.sales_consultant_sale_detail_v1(p_sale_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_tenant uuid:=public.auth_tenant_id();v_actor uuid:=auth.uid();v_sale jsonb;
BEGIN
 IF v_tenant IS NULL OR v_actor IS NULL OR public.sales_membership_role() IS DISTINCT FROM 'CONSULTANT' THEN RAISE EXCEPTION 'sales_consultant_required' USING ERRCODE='42501';END IF;
 SELECT to_jsonb(x)INTO v_sale FROM(SELECT s.id,s.pv_number,s.sale_value,s.freight_value,s.discount_value,s.payment_method_id,pm.name payment_method_name,s.installments,s.sets_count,s.loose_pieces_count,s.pieces_total,s.invoice_number,s.status,s.sold_at,s.revision,s.period_id,sp.status period_status,sp.starts_on,sp.ends_on,sp.status='OPEN' can_edit FROM public.sales s JOIN public.sales_periods sp ON sp.tenant_id=s.tenant_id AND sp.id=s.period_id LEFT JOIN public.sales_payment_methods pm ON pm.tenant_id=s.tenant_id AND pm.id=s.payment_method_id WHERE s.tenant_id=v_tenant AND s.id=p_sale_id AND s.consultant_profile_id=v_actor AND s.status IN('OPEN','CLOSED'))x;
 IF v_sale IS NULL THEN RAISE EXCEPTION 'sales_not_found_or_out_of_scope' USING ERRCODE='P0002';END IF;
 RETURN v_sale;
END;$$;

CREATE OR REPLACE FUNCTION public.sales_consultant_dashboard_v1(p_period_id uuid DEFAULT NULL,p_month integer DEFAULT NULL,p_year integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_tenant uuid:=public.auth_tenant_id();v_actor uuid:=auth.uid();v_period uuid;v_start date;v_end date;v_timezone text;v_allow_team_aggregates boolean:=false;v_metrics jsonb;v_pipeline jsonb;v_available_periods jsonb:='[]'::jsonb;v_ticket_sale numeric:=0;v_ticket_piece numeric:=0;v_average_per_business_day numeric:=0;v_current_month numeric:=0;v_previous_month numeric:=0;v_year_total numeric:=0;v_month_start date;v_as_of date;v_quarter integer;v_quarter_start date;v_quarter_end date;v_quarter_realized numeric:=0;v_quarter_target numeric:=0;v_quarter_goals jsonb:='[]'::jsonb;v_collective jsonb;
BEGIN
 IF v_tenant IS NULL OR v_actor IS NULL OR public.sales_membership_role() IS DISTINCT FROM 'CONSULTANT' THEN RAISE EXCEPTION 'sales_consultant_required' USING ERRCODE='42501';END IF;
 IF(p_month IS NOT NULL AND p_month NOT BETWEEN 1 AND 12)OR(p_year IS NOT NULL AND p_year NOT BETWEEN 2000 AND 2200)THEN RAISE EXCEPTION 'sales_filter_validation' USING ERRCODE='22023';END IF;
 SELECT COALESCE(sc.timezone,'America/Sao_Paulo'),COALESCE(sc.allow_team_aggregates,false)INTO v_timezone,v_allow_team_aggregates FROM(SELECT 1)q LEFT JOIN public.sales_config sc ON sc.tenant_id=v_tenant;v_as_of:=(now()AT TIME ZONE v_timezone)::date;
 SELECT sp.id,sp.starts_on,sp.ends_on INTO v_period,v_start,v_end FROM public.sales_periods sp WHERE sp.tenant_id=v_tenant AND(p_period_id IS NULL OR sp.id=p_period_id)AND(p_month IS NULL OR extract(month FROM sp.starts_on)=p_month OR extract(month FROM sp.ends_on)=p_month)AND(p_year IS NULL OR extract(year FROM sp.starts_on)=p_year OR extract(year FROM sp.ends_on)=p_year)ORDER BY(sp.status='OPEN')DESC,sp.starts_on DESC LIMIT 1;
 IF v_period IS NULL THEN RAISE EXCEPTION 'sales_not_found_or_out_of_scope' USING ERRCODE='P0002';END IF;
 v_metrics:=public.sales_metrics_internal_v1(v_tenant,v_period,v_actor,v_as_of);
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',sp.id,'starts_on',sp.starts_on,'ends_on',sp.ends_on,'status',sp.status)ORDER BY sp.starts_on DESC,sp.ends_on DESC,sp.id),'[]'::jsonb)INTO v_available_periods FROM public.sales_periods sp WHERE sp.tenant_id=v_tenant;
 SELECT jsonb_build_object('value',COALESCE(sum(s.sale_value-s.discount_value),0),'sales_count',count(*),'pieces_total',COALESCE(sum(s.pieces_total),0),'freight_total',COALESCE(sum(s.freight_value),0))INTO v_pipeline FROM public.sales s WHERE s.tenant_id=v_tenant AND s.period_id=v_period AND s.consultant_profile_id=v_actor AND s.status='OPEN';
 v_ticket_sale:=CASE WHEN(v_metrics->>'sales_count')::numeric=0 THEN 0 ELSE round((v_metrics->>'realized_value')::numeric/(v_metrics->>'sales_count')::numeric,2)END;
 v_ticket_piece:=CASE WHEN(v_metrics->>'pieces_total')::numeric=0 THEN 0 ELSE round((v_metrics->>'realized_value')::numeric/(v_metrics->>'pieces_total')::numeric,2)END;
 v_average_per_business_day:=CASE WHEN COALESCE((v_metrics->>'business_days_elapsed')::numeric,0)=0 THEN 0 ELSE round((v_metrics->>'realized_value')::numeric/(v_metrics->>'business_days_elapsed')::numeric,2)END;
 v_month_start:=make_date(COALESCE(p_year,extract(year FROM v_start)::integer),COALESCE(p_month,extract(month FROM v_start)::integer),1);
 SELECT COALESCE(sum(s.sale_value-s.discount_value)FILTER(WHERE(s.sold_at AT TIME ZONE v_timezone)::date>=v_month_start AND(s.sold_at AT TIME ZONE v_timezone)::date<v_month_start+interval'1 month'),0),COALESCE(sum(s.sale_value-s.discount_value)FILTER(WHERE(s.sold_at AT TIME ZONE v_timezone)::date>=v_month_start-interval'1 month' AND(s.sold_at AT TIME ZONE v_timezone)::date<v_month_start),0),COALESCE(sum(s.sale_value-s.discount_value)FILTER(WHERE extract(year FROM s.sold_at AT TIME ZONE v_timezone)=extract(year FROM v_month_start)),0)INTO v_current_month,v_previous_month,v_year_total FROM public.sales s WHERE s.tenant_id=v_tenant AND s.consultant_profile_id=v_actor AND s.status='CLOSED';
 v_quarter:=((extract(month FROM v_month_start)::integer-1)/3)+1;v_quarter_start:=make_date(extract(year FROM v_month_start)::integer,(v_quarter-1)*3+1,1);v_quarter_end:=(v_quarter_start+interval'3 months'-interval'1 day')::date;
 SELECT COALESCE(sum(s.sale_value-s.discount_value),0)INTO v_quarter_realized FROM public.sales s WHERE s.tenant_id=v_tenant AND s.consultant_profile_id=v_actor AND s.status='CLOSED' AND(s.sold_at AT TIME ZONE v_timezone)::date BETWEEN v_quarter_start AND v_quarter_end;
 SELECT COALESCE(max(sga.target_value_snapshot),0),COALESCE(jsonb_agg(jsonb_build_object('goal_id',sga.goal_id,'name',sga.goal_name_snapshot,'target_value',sga.target_value_snapshot,'progress_percent',CASE WHEN sga.target_value_snapshot=0 THEN 0 ELSE round(v_quarter_realized/sga.target_value_snapshot*100,2)END,'commission_percent',sga.commission_percent_snapshot,'is_challenge',sga.goal_is_challenge_snapshot,'sort_order',sga.goal_sort_order_snapshot)ORDER BY sga.goal_sort_order_snapshot,sga.target_value_snapshot,sga.goal_id),'[]'::jsonb)INTO v_quarter_target,v_quarter_goals FROM public.sales_goal_assignments sga WHERE sga.tenant_id=v_tenant AND sga.period_id=v_period AND sga.profile_id=v_actor AND sga.is_active AND sga.goal_scope_snapshot='QUARTERLY' AND(sga.valid_from_snapshot IS NULL OR sga.valid_from_snapshot<=v_quarter_end)AND(sga.valid_until_snapshot IS NULL OR sga.valid_until_snapshot>=v_quarter_start);
 IF NOT v_allow_team_aggregates THEN
  v_collective:=jsonb_build_object('allowed',false);
 ELSE
  SELECT jsonb_build_object('allowed',true,'target_value',q.target_value,'realized_value',q.realized_value,'progress_percent',CASE WHEN q.target_value=0 THEN 0 ELSE round(q.realized_value/q.target_value*100,2)END)INTO v_collective FROM(SELECT COALESCE((SELECT max(sga.target_value_snapshot)FROM public.sales_goal_assignments sga WHERE sga.tenant_id=v_tenant AND sga.period_id=v_period AND sga.profile_id IS NULL AND sga.is_active AND sga.goal_scope_snapshot='COLLECTIVE'),0)target_value,COALESCE((SELECT sum(s.sale_value-s.discount_value)FROM public.sales s WHERE s.tenant_id=v_tenant AND s.period_id=v_period AND s.status='CLOSED'),0)realized_value)q;
 END IF;
 RETURN jsonb_build_object('period_id',v_period,'available_periods',v_available_periods,'filters',jsonb_build_object('month',p_month,'year',p_year),'realized',v_metrics,'average_per_business_day',v_average_per_business_day,'pipeline',v_pipeline,'tickets',jsonb_build_object('sale',v_ticket_sale,'piece',v_ticket_piece),'comparison',jsonb_build_object('current_month',v_current_month,'previous_month',v_previous_month,'delta_value',v_current_month-v_previous_month,'delta_percent',CASE WHEN v_previous_month=0 THEN 0 ELSE round((v_current_month-v_previous_month)/v_previous_month*100,2)END),'accumulated',jsonb_build_object('year',extract(year FROM v_month_start)::integer,'realized_value',v_year_total),'quarterly',jsonb_build_object('quarter',v_quarter,'year',extract(year FROM v_quarter_start)::integer,'starts_on',v_quarter_start,'ends_on',v_quarter_end,'realized_value',v_quarter_realized,'target_value',v_quarter_target,'progress_percent',CASE WHEN v_quarter_target=0 THEN 0 ELSE round(v_quarter_realized/v_quarter_target*100,2)END,'goals',v_quarter_goals),'collective',v_collective);
END;$$;

CREATE OR REPLACE FUNCTION public.sales_consultant_claim_celebration_v1(p_period_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_tenant uuid:=public.auth_tenant_id();v_actor uuid:=auth.uid();v_goal_id uuid;v_target numeric;v_commission numeric;v_realized numeric;v_goal_name text;v_inserted integer;
BEGIN
 IF v_tenant IS NULL OR v_actor IS NULL OR public.sales_membership_role() IS DISTINCT FROM 'CONSULTANT' THEN RAISE EXCEPTION 'sales_consultant_required' USING ERRCODE='42501';END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_tenant::text||':sales-celebration:'||p_period_id::text||':'||v_actor::text,0));
 SELECT COALESCE(sum(s.sale_value-s.discount_value),0)INTO v_realized FROM public.sales s WHERE s.tenant_id=v_tenant AND s.period_id=p_period_id AND s.consultant_profile_id=v_actor AND s.status='CLOSED';
 SELECT sga.goal_id,sga.goal_name_snapshot,sga.target_value_snapshot,sga.commission_percent_snapshot INTO v_goal_id,v_goal_name,v_target,v_commission FROM public.sales_goal_assignments sga JOIN public.sales_periods sp ON sp.tenant_id=sga.tenant_id AND sp.id=sga.period_id WHERE sga.tenant_id=v_tenant AND sga.period_id=p_period_id AND sga.profile_id=v_actor AND sga.is_active AND sga.goal_scope_snapshot='INDIVIDUAL' AND sga.target_value_snapshot>0 AND sga.target_value_snapshot<=v_realized AND(sp.status='OPEN')AND(sga.valid_from_snapshot IS NULL OR sga.valid_from_snapshot<=sp.ends_on)AND(sga.valid_until_snapshot IS NULL OR sga.valid_until_snapshot>=sp.starts_on)AND NOT EXISTS(SELECT 1 FROM public.sales_celebrations sce WHERE sce.tenant_id=v_tenant AND sce.period_id=p_period_id AND sce.goal_id=sga.goal_id AND sce.profile_id=v_actor AND sce.audience='PRIVATE')ORDER BY sga.target_value_snapshot ASC,sga.goal_sort_order_snapshot ASC,sga.goal_id ASC LIMIT 1;
 IF v_goal_id IS NULL THEN RETURN jsonb_build_object('claimed',false,'already_claimed',false,'status','no_eligible_milestone','period_id',p_period_id);END IF;
 INSERT INTO public.sales_celebrations(tenant_id,period_id,goal_id,profile_id,audience)VALUES(v_tenant,p_period_id,v_goal_id,v_actor,'PRIVATE')ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS v_inserted=ROW_COUNT;
 RETURN jsonb_build_object('claimed',v_inserted=1,'already_claimed',v_inserted=0,'status',CASE WHEN v_inserted=1 THEN'claimed'ELSE'already_claimed'END,'period_id',p_period_id,'goal_id',v_goal_id,'goal_name',v_goal_name,'threshold_value',v_target,'commission_percent',v_commission,'audience','PRIVATE');
END;$$;

REVOKE EXECUTE ON FUNCTION public.sales_upsert_sale_v1(uuid,uuid,text,numeric,numeric,numeric,uuid,integer,integer,integer,text,public."SalesSaleStatus",timestamptz),public.sales_claim_celebration_v1(uuid,uuid,uuid,public."SalesCelebrationAudience") FROM authenticated;
REVOKE ALL ON FUNCTION public.sales_consultant_upsert_sale_v1(uuid,text,numeric,numeric,numeric,uuid,integer,integer,integer,text,public."SalesSaleStatus",timestamptz,bigint,text),public.sales_consultant_list_sales_v1(uuid,integer,integer,public."SalesSaleStatus",integer,integer),public.sales_consultant_sale_detail_v1(uuid),public.sales_consultant_dashboard_v1(uuid,integer,integer),public.sales_consultant_claim_celebration_v1(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_consultant_upsert_sale_v1(uuid,text,numeric,numeric,numeric,uuid,integer,integer,integer,text,public."SalesSaleStatus",timestamptz,bigint,text),public.sales_consultant_list_sales_v1(uuid,integer,integer,public."SalesSaleStatus",integer,integer),public.sales_consultant_sale_detail_v1(uuid),public.sales_consultant_dashboard_v1(uuid,integer,integer),public.sales_consultant_claim_celebration_v1(uuid) TO authenticated;

COMMIT;

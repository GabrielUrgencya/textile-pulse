BEGIN;

ALTER TABLE public.sales_config ADD COLUMN revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0);
ALTER TABLE public.sales_holidays
  ADD COLUMN is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0);
ALTER TABLE public.sales_periods ADD COLUMN revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0);
ALTER TABLE public.sales_goals ADD COLUMN revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0);
ALTER TABLE public.sales_goal_assignments
  ADD COLUMN target_value_snapshot numeric(14,2),
  ADD COLUMN commission_percent_snapshot numeric(7,4),
  ADD COLUMN goal_name_snapshot text,
  ADD COLUMN goal_scope_snapshot public."SalesGoalScope",
  ADD COLUMN goal_sort_order_snapshot integer,
  ADD COLUMN goal_is_challenge_snapshot boolean,
  ADD COLUMN valid_from_snapshot date,
  ADD COLUMN valid_until_snapshot date,
  ADD COLUMN goal_revision bigint,
  ADD COLUMN is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0);

UPDATE public.sales_goal_assignments sga
SET target_value_snapshot = sg.target_value,
    commission_percent_snapshot = sg.commission_percent,
    goal_name_snapshot = sg.name,
    goal_scope_snapshot = sg.scope,
    goal_sort_order_snapshot = sg.sort_order,
    goal_is_challenge_snapshot = sg.is_challenge,
    valid_from_snapshot = sg.valid_from,
    valid_until_snapshot = sg.valid_until,
    goal_revision = sg.revision
FROM public.sales_goals sg
WHERE sg.tenant_id = sga.tenant_id AND sg.id = sga.goal_id;

ALTER TABLE public.sales_goal_assignments
  ALTER COLUMN target_value_snapshot SET NOT NULL,
  ALTER COLUMN commission_percent_snapshot SET NOT NULL,
  ALTER COLUMN goal_name_snapshot SET NOT NULL,
  ALTER COLUMN goal_scope_snapshot SET NOT NULL,
  ALTER COLUMN goal_sort_order_snapshot SET NOT NULL,
  ALTER COLUMN goal_is_challenge_snapshot SET NOT NULL,
  ALTER COLUMN goal_revision SET NOT NULL,
  ADD CONSTRAINT sales_goal_assignments_target_snapshot_check CHECK (target_value_snapshot >= 0),
  ADD CONSTRAINT sales_goal_assignments_commission_snapshot_check CHECK (commission_percent_snapshot BETWEEN 0 AND 100);

CREATE OR REPLACE FUNCTION public.sales_admin_configuration_v1()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_tenant uuid := public.auth_tenant_id();
BEGIN
  IF v_tenant IS NULL OR auth.uid() IS NULL OR NOT public.sales_is_admin() THEN
    RAISE EXCEPTION 'sales_admin_required' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'config', (SELECT to_jsonb(sc) - 'tenant_id' FROM public.sales_config sc WHERE sc.tenant_id = v_tenant),
    'holidays', (SELECT COALESCE(jsonb_agg(to_jsonb(sh) - 'tenant_id' ORDER BY sh.date, sh.id), '[]') FROM public.sales_holidays sh WHERE sh.tenant_id = v_tenant),
    'periods', (SELECT COALESCE(jsonb_agg((to_jsonb(sp) - 'tenant_id') || jsonb_build_object('read_only_reason', CASE WHEN sp.status = 'CLOSED' THEN 'CLOSED_PERIOD' END) ORDER BY sp.starts_on DESC, sp.id), '[]') FROM public.sales_periods sp WHERE sp.tenant_id = v_tenant),
    'goals', (SELECT COALESCE(jsonb_agg(to_jsonb(sg) - 'tenant_id' ORDER BY sg.sort_order, sg.id), '[]') FROM public.sales_goals sg WHERE sg.tenant_id = v_tenant),
    'assignments', (SELECT COALESCE(jsonb_agg(to_jsonb(sga) - 'tenant_id' ORDER BY sga.period_id, sga.goal_id, sga.profile_id NULLS FIRST), '[]') FROM public.sales_goal_assignments sga WHERE sga.tenant_id = v_tenant)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_admin_set_goal_v1(
 p_goal_id uuid,p_provisioning_key text,p_name text,p_scope public."SalesGoalScope",p_target_value numeric,
 p_commission_percent numeric,p_sort_order integer,p_is_challenge boolean,p_is_active boolean,
 p_valid_from date,p_valid_until date,p_expected_revision bigint
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE v_tenant uuid:=public.auth_tenant_id();v_actor uuid:=auth.uid();v_before jsonb;v_after jsonb;v_id uuid;
BEGIN
 IF v_tenant IS NULL OR v_actor IS NULL OR NOT public.sales_is_admin() THEN RAISE EXCEPTION 'sales_admin_required' USING ERRCODE='42501';END IF;
 IF length(btrim(COALESCE(p_name,''))) NOT BETWEEN 1 AND 120 OR p_scope IS NULL OR p_target_value<0 OR p_commission_percent NOT BETWEEN 0 AND 100 OR p_sort_order<0 OR p_is_challenge IS NULL OR p_is_active IS NULL OR p_expected_revision IS NULL OR (p_valid_from IS NOT NULL AND p_valid_until IS NOT NULL AND p_valid_until<p_valid_from) THEN RAISE EXCEPTION 'sales_goal_validation' USING ERRCODE='22023';END IF;
 IF p_provisioning_key IS NOT NULL AND (p_provisioning_key NOT IN('META_1','META_2','META_3','CHALLENGE','QUARTERLY','COLLECTIVE') OR (p_provisioning_key='COLLECTIVE')<>(p_scope='COLLECTIVE')) THEN RAISE EXCEPTION 'sales_goal_identity_scope_invalid' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant::text||':sales-goals',0));
 IF p_goal_id IS NULL THEN
   IF p_expected_revision<>0 THEN RAISE EXCEPTION 'sales_stale_revision' USING ERRCODE='40001';END IF;
   INSERT INTO public.sales_goals(tenant_id,provisioning_key,name,scope,target_value,commission_percent,sort_order,is_challenge,is_active,valid_from,valid_until,revision)
   VALUES(v_tenant,p_provisioning_key,btrim(p_name),p_scope,p_target_value,p_commission_percent,p_sort_order,p_is_challenge,p_is_active,p_valid_from,p_valid_until,1)
   RETURNING id,to_jsonb(sales_goals.*) INTO v_id,v_after;
 ELSE
   SELECT to_jsonb(sg) INTO v_before FROM public.sales_goals sg WHERE sg.tenant_id=v_tenant AND sg.id=p_goal_id FOR UPDATE;
   IF v_before IS NULL THEN RAISE EXCEPTION 'sales_not_found_or_out_of_scope' USING ERRCODE='P0002';END IF;
   IF (v_before->>'revision')::bigint<>p_expected_revision THEN RAISE EXCEPTION 'sales_stale_revision' USING ERRCODE='40001',DETAIL=v_before::text;END IF;
   UPDATE public.sales_goals SET provisioning_key=COALESCE(provisioning_key,p_provisioning_key),name=btrim(p_name),scope=p_scope,target_value=p_target_value,commission_percent=p_commission_percent,sort_order=p_sort_order,is_challenge=p_is_challenge,is_active=p_is_active,valid_from=p_valid_from,valid_until=p_valid_until,revision=revision+1,updated_at=now() WHERE tenant_id=v_tenant AND id=p_goal_id RETURNING id,to_jsonb(sales_goals.*) INTO v_id,v_after;
   UPDATE public.sales_goal_assignments sga SET target_value_snapshot=p_target_value,commission_percent_snapshot=p_commission_percent,goal_name_snapshot=btrim(p_name),goal_scope_snapshot=p_scope,goal_sort_order_snapshot=p_sort_order,goal_is_challenge_snapshot=p_is_challenge,valid_from_snapshot=p_valid_from,valid_until_snapshot=p_valid_until,goal_revision=(v_after->>'revision')::bigint,revision=sga.revision+1,updated_at=now()
   FROM public.sales_periods sp WHERE sga.tenant_id=v_tenant AND sga.goal_id=p_goal_id AND sp.tenant_id=sga.tenant_id AND sp.id=sga.period_id AND sp.status='OPEN';
 END IF;
 INSERT INTO public.sales_audit_events(tenant_id,actor_id,action,entity_type,entity_id,details) VALUES(v_tenant,v_actor,'SALES_GOAL_VERSION_SET','sales_goal',v_id,jsonb_build_object('before',v_before,'after',v_after,'closed_assignments_preserved',true));
 RETURN v_after-'tenant_id';
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'sales_duplicate_goal_identity' USING ERRCODE='23505';
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_admin_set_goal_assignment_v1(
 p_assignment_id uuid,p_goal_id uuid,p_period_id uuid,p_profile_id uuid,p_is_active boolean,p_expected_revision bigint
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE v_tenant uuid:=public.auth_tenant_id();v_actor uuid:=auth.uid();v_goal public.sales_goals%ROWTYPE;v_before jsonb;v_after jsonb;v_id uuid;
BEGIN
 IF v_tenant IS NULL OR v_actor IS NULL OR NOT public.sales_is_admin() THEN RAISE EXCEPTION 'sales_admin_required' USING ERRCODE='42501';END IF;
 IF p_goal_id IS NULL OR p_period_id IS NULL OR p_is_active IS NULL OR p_expected_revision IS NULL THEN RAISE EXCEPTION 'sales_assignment_validation' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant::text||':sales-assignments:'||p_period_id::text,0));
 IF NOT EXISTS(SELECT 1 FROM public.sales_periods sp WHERE sp.tenant_id=v_tenant AND sp.id=p_period_id AND sp.status='OPEN' FOR UPDATE) THEN RAISE EXCEPTION 'sales_closed_period_or_not_found' USING ERRCODE='25006';END IF;
 SELECT * INTO v_goal FROM public.sales_goals sg WHERE sg.tenant_id=v_tenant AND sg.id=p_goal_id AND sg.is_active;
 IF v_goal.id IS NULL THEN RAISE EXCEPTION 'sales_not_found_or_out_of_scope' USING ERRCODE='P0002';END IF;
 IF (v_goal.valid_from IS NOT NULL AND v_goal.valid_from>(SELECT sp.ends_on FROM public.sales_periods sp WHERE sp.tenant_id=v_tenant AND sp.id=p_period_id)) OR (v_goal.valid_until IS NOT NULL AND v_goal.valid_until<(SELECT sp.starts_on FROM public.sales_periods sp WHERE sp.tenant_id=v_tenant AND sp.id=p_period_id)) THEN RAISE EXCEPTION 'sales_goal_outside_period_validity' USING ERRCODE='23514';END IF;
 IF (v_goal.scope='INDIVIDUAL' AND (p_profile_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.sales_memberships sm WHERE sm.tenant_id=v_tenant AND sm.profile_id=p_profile_id AND sm.role='CONSULTANT' AND sm.is_active))) OR (v_goal.scope='COLLECTIVE' AND p_profile_id IS NOT NULL) THEN RAISE EXCEPTION 'sales_ineligible_assignee' USING ERRCODE='23514';END IF;
 IF p_assignment_id IS NULL THEN
   IF p_expected_revision<>0 THEN RAISE EXCEPTION 'sales_stale_revision' USING ERRCODE='40001';END IF;
   SELECT to_jsonb(sga),sga.id INTO v_before,v_id FROM public.sales_goal_assignments sga WHERE sga.tenant_id=v_tenant AND sga.goal_id=p_goal_id AND sga.period_id=p_period_id AND sga.profile_id IS NOT DISTINCT FROM p_profile_id FOR UPDATE;
   IF v_id IS NULL THEN INSERT INTO public.sales_goal_assignments(tenant_id,goal_id,period_id,profile_id,target_value_snapshot,commission_percent_snapshot,goal_name_snapshot,goal_scope_snapshot,goal_sort_order_snapshot,goal_is_challenge_snapshot,valid_from_snapshot,valid_until_snapshot,goal_revision,is_active,revision) VALUES(v_tenant,p_goal_id,p_period_id,p_profile_id,v_goal.target_value,v_goal.commission_percent,v_goal.name,v_goal.scope,v_goal.sort_order,v_goal.is_challenge,v_goal.valid_from,v_goal.valid_until,v_goal.revision,p_is_active,1) RETURNING id,to_jsonb(sales_goal_assignments.*) INTO v_id,v_after;
   ELSE UPDATE public.sales_goal_assignments SET is_active=p_is_active,target_value_snapshot=v_goal.target_value,commission_percent_snapshot=v_goal.commission_percent,goal_name_snapshot=v_goal.name,goal_scope_snapshot=v_goal.scope,goal_sort_order_snapshot=v_goal.sort_order,goal_is_challenge_snapshot=v_goal.is_challenge,valid_from_snapshot=v_goal.valid_from,valid_until_snapshot=v_goal.valid_until,goal_revision=v_goal.revision,revision=revision+1,updated_at=now() WHERE tenant_id=v_tenant AND id=v_id RETURNING to_jsonb(sales_goal_assignments.*) INTO v_after; END IF;
 ELSE
   SELECT to_jsonb(sga) INTO v_before FROM public.sales_goal_assignments sga WHERE sga.tenant_id=v_tenant AND sga.id=p_assignment_id AND sga.period_id=p_period_id FOR UPDATE;
   IF v_before IS NULL THEN RAISE EXCEPTION 'sales_not_found_or_out_of_scope' USING ERRCODE='P0002';END IF;
   IF (v_before->>'revision')::bigint<>p_expected_revision THEN RAISE EXCEPTION 'sales_stale_revision' USING ERRCODE='40001',DETAIL=v_before::text;END IF;
   UPDATE public.sales_goal_assignments SET goal_id=p_goal_id,profile_id=p_profile_id,target_value_snapshot=v_goal.target_value,commission_percent_snapshot=v_goal.commission_percent,goal_name_snapshot=v_goal.name,goal_scope_snapshot=v_goal.scope,goal_sort_order_snapshot=v_goal.sort_order,goal_is_challenge_snapshot=v_goal.is_challenge,valid_from_snapshot=v_goal.valid_from,valid_until_snapshot=v_goal.valid_until,goal_revision=v_goal.revision,is_active=p_is_active,revision=revision+1,updated_at=now() WHERE tenant_id=v_tenant AND id=p_assignment_id RETURNING id,to_jsonb(sales_goal_assignments.*) INTO v_id,v_after;
 END IF;
 INSERT INTO public.sales_audit_events(tenant_id,actor_id,action,entity_type,entity_id,details) VALUES(v_tenant,v_actor,'SALES_GOAL_ASSIGNMENT_SET','sales_goal_assignment',v_id,jsonb_build_object('before',v_before,'after',v_after));
 RETURN v_after-'tenant_id';
END;
$$;

ALTER FUNCTION public.sales_metrics_v1(uuid,uuid,uuid,date) RENAME TO sales_metrics_legacy_10_1;
REVOKE EXECUTE ON FUNCTION public.sales_metrics_legacy_10_1(uuid,uuid,uuid,date) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.sales_metrics_internal_v1(p_tenant_id uuid,p_period_id uuid,p_profile_id uuid DEFAULT NULL,p_as_of date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE v_start date;v_end date;v_status public."SalesPeriodStatus";v_tz text;v_today date;v_real numeric:=0;v_count bigint:=0;v_pieces bigint:=0;v_freight numeric:=0;v_discount numeric:=0;v_total_days int:=0;v_elapsed int:=0;v_remaining int:=0;v_collective numeric:=0;v_commission numeric:=0;v_goals jsonb:='[]';
BEGIN
 IF p_tenant_id IS NULL OR p_period_id IS NULL THEN RAISE EXCEPTION 'sales_metrics_scope_required' USING ERRCODE='22023';END IF;
 SELECT sp.starts_on,sp.ends_on,sp.status,COALESCE(sc.timezone,'America/Sao_Paulo') INTO v_start,v_end,v_status,v_tz FROM public.sales_periods sp LEFT JOIN public.sales_config sc ON sc.tenant_id=sp.tenant_id WHERE sp.tenant_id=p_tenant_id AND sp.id=p_period_id;
 IF v_start IS NULL THEN RAISE EXCEPTION 'sales_period_not_found' USING ERRCODE='P0002';END IF; v_today:=COALESCE(p_as_of,(now() AT TIME ZONE v_tz)::date);
 SELECT COALESCE(sum(s.sale_value-s.discount_value),0),count(*),COALESCE(sum(s.pieces_total),0),COALESCE(sum(s.freight_value),0),COALESCE(sum(s.discount_value),0) INTO v_real,v_count,v_pieces,v_freight,v_discount FROM public.sales s WHERE s.tenant_id=p_tenant_id AND s.period_id=p_period_id AND s.status='CLOSED' AND (p_profile_id IS NULL OR s.consultant_profile_id=p_profile_id);
 SELECT count(*)::int,count(*) FILTER(WHERE v_status='CLOSED' OR d<=LEAST(v_today,v_end))::int,count(*) FILTER(WHERE v_status='OPEN' AND d>=GREATEST(v_today,v_start))::int INTO v_total_days,v_elapsed,v_remaining FROM(SELECT x::date d FROM generate_series(v_start,v_end,interval '1 day')x WHERE extract(isodow FROM x) BETWEEN 1 AND 5 AND NOT EXISTS(SELECT 1 FROM public.sales_holidays sh WHERE sh.tenant_id=p_tenant_id AND sh.date=x::date AND sh.is_active))q;
 SELECT COALESCE(max(sga.target_value_snapshot),0) INTO v_collective FROM public.sales_goal_assignments sga WHERE sga.tenant_id=p_tenant_id AND sga.period_id=p_period_id AND sga.profile_id IS NULL AND sga.is_active AND sga.goal_scope_snapshot='COLLECTIVE' AND (sga.valid_from_snapshot IS NULL OR sga.valid_from_snapshot<=v_end) AND (sga.valid_until_snapshot IS NULL OR sga.valid_until_snapshot>=v_start);
 IF p_profile_id IS NOT NULL THEN SELECT COALESCE(sga.commission_percent_snapshot,0) INTO v_commission FROM public.sales_goal_assignments sga WHERE sga.tenant_id=p_tenant_id AND sga.period_id=p_period_id AND sga.profile_id=p_profile_id AND sga.is_active AND sga.goal_scope_snapshot='INDIVIDUAL' AND sga.target_value_snapshot<=v_real AND (sga.valid_from_snapshot IS NULL OR sga.valid_from_snapshot<=v_end) AND (sga.valid_until_snapshot IS NULL OR sga.valid_until_snapshot>=v_start) ORDER BY sga.target_value_snapshot DESC,sga.goal_sort_order_snapshot DESC,sga.goal_id LIMIT 1;v_commission:=COALESCE(v_commission,0);END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('goal_id',sga.goal_id,'name',sga.goal_name_snapshot,'scope',sga.goal_scope_snapshot,'target_value',sga.target_value_snapshot,'progress_percent',CASE WHEN sga.target_value_snapshot=0 THEN 0 ELSE round(v_real/sga.target_value_snapshot*100,2) END,'ideal_pace_percent',CASE WHEN v_total_days=0 THEN 0 ELSE round(v_elapsed::numeric/v_total_days*100,2) END,'required_per_business_day',CASE WHEN v_real>=sga.target_value_snapshot THEN 0 WHEN v_remaining=0 THEN NULL ELSE round((sga.target_value_snapshot-v_real)/v_remaining,2) END,'commission_percent',sga.commission_percent_snapshot,'is_challenge',sga.goal_is_challenge_snapshot,'sort_order',sga.goal_sort_order_snapshot) ORDER BY sga.goal_sort_order_snapshot,sga.target_value_snapshot,sga.goal_id),'[]') INTO v_goals FROM public.sales_goal_assignments sga WHERE sga.tenant_id=p_tenant_id AND sga.period_id=p_period_id AND sga.profile_id IS NOT DISTINCT FROM p_profile_id AND sga.is_active AND (sga.valid_from_snapshot IS NULL OR sga.valid_from_snapshot<=v_end) AND (sga.valid_until_snapshot IS NULL OR sga.valid_until_snapshot>=v_start);
 RETURN jsonb_build_object('period_id',p_period_id,'profile_id',p_profile_id,'as_of',v_today,'period_status',v_status,'realized_value',v_real,'sales_count',v_count,'pieces_total',v_pieces,'freight_total',v_freight,'discount_total',v_discount,'business_days_total',v_total_days,'business_days_elapsed',v_elapsed,'business_days_remaining',v_remaining,'ideal_pace_percent',CASE WHEN v_total_days=0 THEN 0 ELSE round(v_elapsed::numeric/v_total_days*100,2) END,'collective_target_value',v_collective,'collective_percent',CASE WHEN v_collective=0 THEN 0 ELSE round(v_real/v_collective*100,2) END,'contribution_percent',CASE WHEN p_profile_id IS NULL OR v_collective=0 THEN NULL ELSE round(v_real/v_collective*100,2) END,'commission_percent',v_commission,'commission_value',round(v_real*v_commission/100,2),'goals',v_goals);
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_metrics_v1(p_tenant_id uuid,p_period_id uuid,p_profile_id uuid DEFAULT NULL,p_as_of date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE v_auth_tenant uuid:=public.auth_tenant_id();v_actor uuid:=auth.uid();v_role public."SalesMemberRole":=public.sales_membership_role();
BEGIN
 IF v_auth_tenant IS NULL OR v_actor IS NULL OR v_role IS NULL OR p_tenant_id<>v_auth_tenant OR (p_profile_id IS DISTINCT FROM v_actor AND v_role<>'ADMIN') THEN RAISE EXCEPTION 'sales_metrics_access_denied' USING ERRCODE='42501';END IF;
 RETURN public.sales_metrics_internal_v1(p_tenant_id,p_period_id,p_profile_id,p_as_of);
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_my_dashboard_v1(p_period_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE v_tenant uuid:=public.auth_tenant_id();v_profile uuid:=auth.uid();v_period uuid;
BEGIN
 IF public.sales_membership_role() IS NULL THEN RAISE EXCEPTION 'sales_access_denied' USING ERRCODE='42501';END IF;
 SELECT sp.id INTO v_period FROM public.sales_periods sp WHERE sp.tenant_id=v_tenant AND (p_period_id IS NULL OR sp.id=p_period_id) ORDER BY (sp.status='OPEN') DESC,sp.starts_on DESC LIMIT 1;
 RETURN public.sales_metrics_internal_v1(v_tenant,v_period,v_profile,NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_admin_dashboard_v1(p_period_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
BEGIN
 IF NOT public.sales_is_admin() THEN RAISE EXCEPTION 'sales_admin_required' USING ERRCODE='42501';END IF;
 RETURN public.sales_metrics_internal_v1(public.auth_tenant_id(),p_period_id,NULL,NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_collective_summary_v1(p_period_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE v_tenant uuid:=public.auth_tenant_id();v_team jsonb;v_members jsonb;
BEGIN
 IF public.sales_membership_role() IS NULL THEN RAISE EXCEPTION 'sales_access_denied' USING ERRCODE='42501';END IF;
 v_team:=public.sales_metrics_internal_v1(v_tenant,p_period_id,NULL,NULL);
 SELECT COALESCE(jsonb_agg(jsonb_build_object('profile_id',x.profile_id,'display_name',x.full_name,'contribution_percent',(x.metrics->>'contribution_percent')::numeric,'position',x.position) ORDER BY x.position),'[]') INTO v_members
 FROM(SELECT ranked.*,rank() OVER(ORDER BY (ranked.metrics->>'realized_value')::numeric DESC) position FROM(SELECT p.id profile_id,p.full_name,public.sales_metrics_internal_v1(v_tenant,p_period_id,p.id,NULL) metrics FROM public.sales_memberships sm JOIN public.profiles p ON p.id=sm.profile_id AND p.tenant_id=sm.tenant_id WHERE sm.tenant_id=v_tenant AND sm.role='CONSULTANT' AND sm.is_active)ranked)x;
 RETURN jsonb_build_object('period_id',p_period_id,'collective_percent',(v_team->>'collective_percent')::numeric,'ideal_pace_percent',(v_team->>'ideal_pace_percent')::numeric,'members',v_members);
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_tv_snapshot_v1(p_token uuid,p_period_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE v_tenant uuid;v_period uuid;v_metrics jsonb;
BEGIN
 SELECT kt.tenant_id INTO v_tenant FROM public.kiosk_tokens kt WHERE kt.token=p_token AND kt.is_active AND kt.scope='sales_tv';
 IF v_tenant IS NULL THEN RAISE EXCEPTION 'sales_tv_token_invalid' USING ERRCODE='42501';END IF;
 SELECT sp.id INTO v_period FROM public.sales_periods sp WHERE sp.tenant_id=v_tenant AND (p_period_id IS NULL OR sp.id=p_period_id) ORDER BY (sp.status='OPEN') DESC,sp.starts_on DESC LIMIT 1;
 v_metrics:=public.sales_metrics_internal_v1(v_tenant,v_period,NULL,NULL);
 RETURN jsonb_build_object('period_id',v_period,'collective_percent',(v_metrics->>'collective_percent')::numeric,'ideal_pace_percent',(v_metrics->>'ideal_pace_percent')::numeric,'updated_at',now());
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_admin_set_config_v1(
  p_pieces_per_set integer, p_timezone text, p_week_starts_on integer,
  p_allow_team_aggregates boolean, p_expected_revision bigint
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE v_tenant uuid := public.auth_tenant_id(); v_actor uuid := auth.uid(); v_before jsonb; v_after jsonb;
BEGIN
  IF v_tenant IS NULL OR v_actor IS NULL OR NOT public.sales_is_admin() THEN RAISE EXCEPTION 'sales_admin_required' USING ERRCODE='42501'; END IF;
  IF p_pieces_per_set NOT BETWEEN 1 AND 1000 OR p_week_starts_on NOT BETWEEN 0 AND 6
     OR p_allow_team_aggregates IS NULL OR p_expected_revision IS NULL
     OR COALESCE(p_timezone,'') = '' OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name=p_timezone) THEN
    RAISE EXCEPTION 'sales_config_validation' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant::text || ':sales-config',0));
  SELECT to_jsonb(sc) INTO v_before FROM public.sales_config sc WHERE sc.tenant_id=v_tenant FOR UPDATE;
  IF v_before IS NOT NULL AND (v_before->>'revision')::bigint <> p_expected_revision THEN RAISE EXCEPTION 'sales_stale_revision' USING ERRCODE='40001', DETAIL=v_before::text; END IF;
  INSERT INTO public.sales_config(tenant_id,pieces_per_set,timezone,week_starts_on,allow_team_aggregates,revision)
  VALUES(v_tenant,p_pieces_per_set,p_timezone,p_week_starts_on,p_allow_team_aggregates,1)
  ON CONFLICT(tenant_id) DO UPDATE SET pieces_per_set=EXCLUDED.pieces_per_set,timezone=EXCLUDED.timezone,
    week_starts_on=EXCLUDED.week_starts_on,allow_team_aggregates=EXCLUDED.allow_team_aggregates,
    revision=sales_config.revision+1,updated_at=now()
  RETURNING to_jsonb(sales_config.*) INTO v_after;
  INSERT INTO public.sales_audit_events(tenant_id,actor_id,action,entity_type,entity_id,details)
  VALUES(v_tenant,v_actor,'SALES_CONFIG_UPDATED','sales_config',(v_after->>'id')::uuid,jsonb_build_object('before',v_before,'after',v_after));
  RETURN v_after-'tenant_id';
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_admin_set_holiday_v1(
  p_holiday_id uuid, p_date date, p_name text, p_is_active boolean, p_expected_revision bigint
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE v_tenant uuid:=public.auth_tenant_id(); v_actor uuid:=auth.uid(); v_before jsonb; v_after jsonb; v_id uuid;
BEGIN
  IF v_tenant IS NULL OR v_actor IS NULL OR NOT public.sales_is_admin() THEN RAISE EXCEPTION 'sales_admin_required' USING ERRCODE='42501'; END IF;
  IF p_date IS NULL OR length(btrim(COALESCE(p_name,''))) NOT BETWEEN 1 AND 120 OR p_is_active IS NULL OR p_expected_revision IS NULL THEN RAISE EXCEPTION 'sales_holiday_validation' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant::text || ':sales-calendar',0));
  IF EXISTS(SELECT 1 FROM public.sales_periods sp WHERE sp.tenant_id=v_tenant AND sp.status='CLOSED' AND p_date BETWEEN sp.starts_on AND sp.ends_on) THEN RAISE EXCEPTION 'sales_closed_period_immutable' USING ERRCODE='25006'; END IF;
  IF p_holiday_id IS NULL THEN
    IF p_expected_revision<>0 THEN RAISE EXCEPTION 'sales_stale_revision' USING ERRCODE='40001'; END IF;
    INSERT INTO public.sales_holidays(tenant_id,date,name,is_active,revision) VALUES(v_tenant,p_date,btrim(p_name),p_is_active,1) RETURNING id,to_jsonb(sales_holidays.*) INTO v_id,v_after;
  ELSE
    SELECT to_jsonb(sh) INTO v_before FROM public.sales_holidays sh WHERE sh.tenant_id=v_tenant AND sh.id=p_holiday_id FOR UPDATE;
    IF v_before IS NULL THEN RAISE EXCEPTION 'sales_not_found_or_out_of_scope' USING ERRCODE='P0002'; END IF;
    IF (v_before->>'revision')::bigint<>p_expected_revision THEN RAISE EXCEPTION 'sales_stale_revision' USING ERRCODE='40001',DETAIL=v_before::text; END IF;
    IF EXISTS(SELECT 1 FROM public.sales_periods sp WHERE sp.tenant_id=v_tenant AND sp.status='CLOSED' AND (v_before->>'date')::date BETWEEN sp.starts_on AND sp.ends_on) THEN RAISE EXCEPTION 'sales_closed_period_immutable' USING ERRCODE='25006'; END IF;
    UPDATE public.sales_holidays SET date=p_date,name=btrim(p_name),is_active=p_is_active,revision=revision+1,updated_at=now() WHERE tenant_id=v_tenant AND id=p_holiday_id RETURNING id,to_jsonb(sales_holidays.*) INTO v_id,v_after;
  END IF;
  INSERT INTO public.sales_audit_events(tenant_id,actor_id,action,entity_type,entity_id,details) VALUES(v_tenant,v_actor,'SALES_HOLIDAY_SET','sales_holiday',v_id,jsonb_build_object('before',v_before,'after',v_after));
  RETURN v_after-'tenant_id';
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'sales_duplicate_holiday' USING ERRCODE='23505';
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_admin_set_period_v1(
 p_period_id uuid,p_starts_on date,p_ends_on date,p_expected_revision bigint
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
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
$$;

REVOKE EXECUTE ON FUNCTION public.sales_admin_configuration_v1() FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.sales_admin_set_config_v1(integer,text,integer,boolean,bigint) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.sales_admin_set_holiday_v1(uuid,date,text,boolean,bigint) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.sales_admin_set_period_v1(uuid,date,date,bigint) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.sales_admin_set_goal_v1(uuid,text,text,public."SalesGoalScope",numeric,numeric,integer,boolean,boolean,date,date,bigint) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.sales_admin_set_goal_assignment_v1(uuid,uuid,uuid,uuid,boolean,bigint) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.sales_metrics_v1(uuid,uuid,uuid,date) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.sales_metrics_internal_v1(uuid,uuid,uuid,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sales_admin_configuration_v1(),public.sales_admin_set_config_v1(integer,text,integer,boolean,bigint),public.sales_admin_set_holiday_v1(uuid,date,text,boolean,bigint),public.sales_admin_set_period_v1(uuid,date,date,bigint),public.sales_admin_set_goal_v1(uuid,text,text,public."SalesGoalScope",numeric,numeric,integer,boolean,boolean,date,date,bigint),public.sales_admin_set_goal_assignment_v1(uuid,uuid,uuid,uuid,boolean,bigint) TO authenticated;

COMMIT;

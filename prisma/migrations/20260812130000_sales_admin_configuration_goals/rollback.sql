BEGIN;

DROP FUNCTION IF EXISTS public.sales_admin_set_goal_assignment_v1(uuid,uuid,uuid,uuid,boolean,bigint);
DROP FUNCTION IF EXISTS public.sales_admin_set_goal_v1(uuid,text,text,public."SalesGoalScope",numeric,numeric,integer,boolean,boolean,date,date,bigint);
DROP FUNCTION IF EXISTS public.sales_admin_set_period_v1(uuid,date,date,bigint);
DROP FUNCTION IF EXISTS public.sales_admin_set_holiday_v1(uuid,date,text,boolean,bigint);
DROP FUNCTION IF EXISTS public.sales_admin_set_config_v1(integer,text,integer,boolean,bigint);
DROP FUNCTION IF EXISTS public.sales_admin_configuration_v1();

DROP FUNCTION IF EXISTS public.sales_metrics_v1(uuid,uuid,uuid,date);
ALTER FUNCTION public.sales_metrics_legacy_10_1(uuid,uuid,uuid,date) RENAME TO sales_metrics_v1;

CREATE OR REPLACE FUNCTION public.sales_my_dashboard_v1(p_period_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE v_tenant uuid := public.auth_tenant_id(); v_profile uuid := auth.uid(); v_period uuid; v_result jsonb;
BEGIN
  IF public.sales_membership_role() IS NULL THEN RAISE EXCEPTION 'sales_access_denied' USING ERRCODE = '42501'; END IF;
  SELECT sp.id INTO v_period FROM public.sales_periods sp
  WHERE sp.tenant_id = v_tenant AND (p_period_id IS NULL OR sp.id = p_period_id)
  ORDER BY (sp.status = 'OPEN') DESC, sp.starts_on DESC LIMIT 1;
  SELECT public.sales_metrics_v1(v_tenant, v_period, v_profile) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_admin_dashboard_v1(p_period_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT public.sales_is_admin() THEN RAISE EXCEPTION 'sales_admin_required' USING ERRCODE = '42501'; END IF;
  SELECT public.sales_metrics_v1(public.auth_tenant_id(), p_period_id, NULL) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_collective_summary_v1(p_period_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE v_tenant uuid := public.auth_tenant_id(); v_team_metrics jsonb; v_members jsonb;
BEGIN
  IF public.sales_membership_role() IS NULL THEN RAISE EXCEPTION 'sales_access_denied' USING ERRCODE = '42501'; END IF;
  SELECT public.sales_metrics_v1(v_tenant, p_period_id, NULL) INTO v_team_metrics;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'profile_id', x.profile_id, 'display_name', x.full_name,
    'contribution_percent', (x.metrics ->> 'contribution_percent')::numeric,
    'position', x.position
  ) ORDER BY x.position), '[]'::jsonb) INTO v_members
  FROM (
    SELECT ranked.profile_id, ranked.full_name, ranked.metrics,
           rank() OVER (ORDER BY (ranked.metrics ->> 'realized_value')::numeric DESC) position
    FROM (
      SELECT p.id profile_id, p.full_name,
             public.sales_metrics_v1(v_tenant, p_period_id, p.id) metrics
      FROM public.sales_memberships sm
      JOIN public.profiles p ON p.id = sm.profile_id AND p.tenant_id = sm.tenant_id
      WHERE sm.tenant_id = v_tenant AND sm.role = 'CONSULTANT' AND sm.is_active
    ) ranked
  ) x;
  RETURN jsonb_build_object(
    'period_id', p_period_id,
    'collective_percent', (v_team_metrics ->> 'collective_percent')::numeric,
    'ideal_pace_percent', (v_team_metrics ->> 'ideal_pace_percent')::numeric,
    'members', v_members
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_tv_snapshot_v1(p_token uuid, p_period_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE v_tenant uuid; v_period uuid; v_metrics jsonb;
BEGIN
  SELECT kt.tenant_id INTO v_tenant FROM public.kiosk_tokens kt
  WHERE kt.token = p_token AND kt.is_active AND kt.scope = 'sales_tv';
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'sales_tv_token_invalid' USING ERRCODE = '42501'; END IF;
  SELECT sp.id INTO v_period FROM public.sales_periods sp
  WHERE sp.tenant_id = v_tenant AND (p_period_id IS NULL OR sp.id = p_period_id)
  ORDER BY (sp.status = 'OPEN') DESC, sp.starts_on DESC LIMIT 1;
  SELECT public.sales_metrics_v1(v_tenant, v_period, NULL) INTO v_metrics;
  RETURN jsonb_build_object(
    'period_id', v_period,
    'collective_percent', (v_metrics ->> 'collective_percent')::numeric,
    'ideal_pace_percent', (v_metrics ->> 'ideal_pace_percent')::numeric,
    'updated_at', now()
  );
END;
$$;

DROP FUNCTION IF EXISTS public.sales_metrics_internal_v1(uuid,uuid,uuid,date);

REVOKE EXECUTE ON FUNCTION public.sales_metrics_v1(uuid,uuid,uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_metrics_v1(uuid,uuid,uuid,date) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.sales_my_dashboard_v1(uuid) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.sales_admin_dashboard_v1(uuid) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.sales_collective_summary_v1(uuid) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.sales_tv_snapshot_v1(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sales_my_dashboard_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_admin_dashboard_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_collective_summary_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_tv_snapshot_v1(uuid,uuid) TO anon,authenticated;

ALTER TABLE public.sales_goal_assignments
  DROP CONSTRAINT IF EXISTS sales_goal_assignments_commission_snapshot_check,
  DROP CONSTRAINT IF EXISTS sales_goal_assignments_target_snapshot_check,
  DROP COLUMN IF EXISTS revision,
  DROP COLUMN IF EXISTS is_active,
  DROP COLUMN IF EXISTS goal_revision,
  DROP COLUMN IF EXISTS valid_until_snapshot,
  DROP COLUMN IF EXISTS valid_from_snapshot,
  DROP COLUMN IF EXISTS goal_is_challenge_snapshot,
  DROP COLUMN IF EXISTS goal_sort_order_snapshot,
  DROP COLUMN IF EXISTS goal_scope_snapshot,
  DROP COLUMN IF EXISTS goal_name_snapshot,
  DROP COLUMN IF EXISTS commission_percent_snapshot,
  DROP COLUMN IF EXISTS target_value_snapshot;
ALTER TABLE public.sales_goals DROP COLUMN IF EXISTS revision;
ALTER TABLE public.sales_periods DROP COLUMN IF EXISTS revision;
ALTER TABLE public.sales_holidays DROP COLUMN IF EXISTS revision, DROP COLUMN IF EXISTS is_active;
ALTER TABLE public.sales_config DROP COLUMN IF EXISTS revision;

COMMIT;

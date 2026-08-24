BEGIN;

DROP FUNCTION IF EXISTS public.sales_tv_snapshot_v1(uuid, uuid);
DROP FUNCTION IF EXISTS public.sales_collective_summary_v1(uuid);
DROP FUNCTION IF EXISTS public.sales_admin_dashboard_v1(uuid);
DROP FUNCTION IF EXISTS public.sales_my_dashboard_v1(uuid);
DROP FUNCTION IF EXISTS public.sales_metrics_v1(uuid, uuid, uuid, date);
DROP FUNCTION IF EXISTS public.sales_claim_celebration_v1(uuid, uuid, uuid, public."SalesCelebrationAudience");
DROP FUNCTION IF EXISTS public.sales_close_period_v1(uuid, text);
DROP FUNCTION IF EXISTS public.sales_cancel_sale_v1(uuid, text);
DROP FUNCTION IF EXISTS public.sales_upsert_sale_v1(uuid, uuid, text, numeric, numeric, numeric, uuid, integer, integer, integer, text, public."SalesSaleStatus", timestamptz);
DROP FUNCTION IF EXISTS public.sales_my_access_v1();
DROP FUNCTION IF EXISTS public.sales_is_admin();
DROP FUNCTION IF EXISTS public.sales_membership_role();

DROP TABLE IF EXISTS public.sales_audit_events;
DROP TABLE IF EXISTS public.sales_celebrations;
DROP TABLE IF EXISTS public.sales_period_closures;
DROP TABLE IF EXISTS public.sales_goal_assignments;
DROP TABLE IF EXISTS public.sales_goals;
DROP TABLE IF EXISTS public.sales;
DROP TABLE IF EXISTS public.sales_periods;
DROP TABLE IF EXISTS public.sales_payment_methods;
DROP TABLE IF EXISTS public.sales_holidays;
DROP TABLE IF EXISTS public.sales_config;
DROP TABLE IF EXISTS public.sales_memberships;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_tenant_id_id_key;

DROP TYPE IF EXISTS public."SalesCelebrationAudience";
DROP TYPE IF EXISTS public."SalesPeriodStatus";
DROP TYPE IF EXISTS public."SalesGoalScope";
DROP TYPE IF EXISTS public."SalesSaleStatus";
DROP TYPE IF EXISTS public."SalesMemberRole";

COMMIT;

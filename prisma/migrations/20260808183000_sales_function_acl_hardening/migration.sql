BEGIN;

REVOKE EXECUTE ON FUNCTION public.sales_membership_role() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sales_is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sales_my_access_v1() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sales_upsert_sale_v1(uuid, uuid, text, numeric, numeric, numeric, uuid, integer, integer, integer, text, public."SalesSaleStatus", timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sales_cancel_sale_v1(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sales_close_period_v1(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sales_claim_celebration_v1(uuid, uuid, uuid, public."SalesCelebrationAudience") FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sales_metrics_v1(uuid, uuid, uuid, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sales_my_dashboard_v1(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sales_admin_dashboard_v1(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sales_collective_summary_v1(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.sales_membership_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_my_access_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_upsert_sale_v1(uuid, uuid, text, numeric, numeric, numeric, uuid, integer, integer, integer, text, public."SalesSaleStatus", timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_cancel_sale_v1(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_close_period_v1(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_claim_celebration_v1(uuid, uuid, uuid, public."SalesCelebrationAudience") TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_metrics_v1(uuid, uuid, uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_my_dashboard_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_admin_dashboard_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_collective_summary_v1(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.sales_tv_snapshot_v1(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sales_tv_snapshot_v1(uuid, uuid) TO anon, authenticated;

COMMIT;

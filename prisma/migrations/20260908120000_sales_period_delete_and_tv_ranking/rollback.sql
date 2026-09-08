-- Rollback de 20260908120000_sales_period_delete_and_tv_ranking
DROP FUNCTION IF EXISTS public.sales_tv_kiosk_ranking_v2(text, text);
DROP FUNCTION IF EXISTS public.sales_admin_delete_period_v1(uuid);

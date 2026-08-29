-- Rollback de 20260825210000_sales_auto_open_period
DROP FUNCTION IF EXISTS public.sales_admin_set_auto_open_period_v1(boolean);
DROP FUNCTION IF EXISTS public.sales_ensure_open_period_v1();
ALTER TABLE public.sales_config DROP COLUMN IF EXISTS auto_open_period;

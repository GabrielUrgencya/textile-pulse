-- Rollback de 20260825190000_sales_area_permissions
DROP FUNCTION IF EXISTS public.sales_admin_set_area_permissions_v1(jsonb, jsonb);
DROP FUNCTION IF EXISTS public.sales_admin_area_permissions_v1();
DROP FUNCTION IF EXISTS public.sales_my_areas_v1();
DROP TABLE IF EXISTS public.sales_user_area_permissions;
DROP TABLE IF EXISTS public.sales_area_permissions;

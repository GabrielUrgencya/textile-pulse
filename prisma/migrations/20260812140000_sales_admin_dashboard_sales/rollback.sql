BEGIN;
DROP FUNCTION IF EXISTS public.sales_admin_sale_detail_v1(uuid);
DROP FUNCTION IF EXISTS public.sales_admin_cancel_sale_v2(uuid,bigint,text,text);
DROP FUNCTION IF EXISTS public.sales_admin_upsert_sale_v2(uuid,uuid,text,numeric,numeric,numeric,uuid,integer,integer,integer,text,public."SalesSaleStatus",timestamptz,bigint,text);
DROP FUNCTION IF EXISTS public.sales_admin_list_sales_v1(uuid,uuid,public."SalesSaleStatus",integer,integer,text,text);
DROP FUNCTION IF EXISTS public.sales_admin_dashboard_v2(uuid,uuid);
DROP TABLE IF EXISTS public.sales_mutation_requests;
ALTER TABLE public.sales DROP COLUMN IF EXISTS revision;
COMMIT;

BEGIN;
DROP FUNCTION IF EXISTS public.sales_consultant_claim_celebration_v1(uuid);
DROP FUNCTION IF EXISTS public.sales_consultant_dashboard_v1(uuid,integer,integer);
DROP FUNCTION IF EXISTS public.sales_consultant_sale_detail_v1(uuid);
DROP FUNCTION IF EXISTS public.sales_consultant_list_sales_v1(uuid,integer,integer,public."SalesSaleStatus",integer,integer);
DROP FUNCTION IF EXISTS public.sales_consultant_upsert_sale_v1(uuid,text,numeric,numeric,numeric,uuid,integer,integer,integer,text,public."SalesSaleStatus",timestamptz,bigint,text);
GRANT EXECUTE ON FUNCTION public.sales_upsert_sale_v1(uuid,uuid,text,numeric,numeric,numeric,uuid,integer,integer,integer,text,public."SalesSaleStatus",timestamptz),public.sales_claim_celebration_v1(uuid,uuid,uuid,public."SalesCelebrationAudience") TO authenticated;
COMMIT;

BEGIN;
DROP FUNCTION IF EXISTS public.sales_collective_summary_v2(text,integer,integer,integer,integer);
DROP FUNCTION IF EXISTS public.sales_collective_period_key_v1(uuid,uuid);
REVOKE EXECUTE ON FUNCTION public.sales_collective_summary_v1(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_collective_summary_v1(uuid) TO authenticated;
COMMIT;

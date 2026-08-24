-- Rollback D2: remove os RPCs e a tabela de dados da consultora.
BEGIN;

DROP FUNCTION IF EXISTS public.sales_admin_set_consultant_details_v1(uuid,text,text,text);
DROP FUNCTION IF EXISTS public.sales_admin_consultant_details_v1(uuid);
DROP TABLE IF EXISTS public.sales_consultant_details;

COMMIT;

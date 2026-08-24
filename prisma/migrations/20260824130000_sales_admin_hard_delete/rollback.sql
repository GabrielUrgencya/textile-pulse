-- Rollback D1: remove o RPC de exclusão definitiva e restaura o CHECK original de operações.
-- Atenção: a reversão do CHECK falha se já existirem linhas com operation='DELETE'
-- (limpe-as antes, se necessário: DELETE FROM public.sales_mutation_requests WHERE operation='DELETE';).
BEGIN;

DROP FUNCTION IF EXISTS public.sales_admin_delete_sale_v1(uuid,bigint,text);

ALTER TABLE public.sales_mutation_requests DROP CONSTRAINT IF EXISTS sales_mutation_requests_operation_check;
ALTER TABLE public.sales_mutation_requests ADD CONSTRAINT sales_mutation_requests_operation_check CHECK (operation IN ('UPSERT','CANCEL'));

COMMIT;

-- Rollback de 20260825130000_sales_admin_provision_defaults
--
-- Remove apenas a função RPC. NÃO desfaz dados semeados por ela (metas/período/
-- métodos/atribuições) — esses são registros legítimos de negócio que o cliente
-- pode já ter editado; removê-los seria destrutivo. Para reverter dados de um
-- tenant específico, faça-o manualmente e com backup.

DROP FUNCTION IF EXISTS public.sales_admin_provision_defaults_v1();

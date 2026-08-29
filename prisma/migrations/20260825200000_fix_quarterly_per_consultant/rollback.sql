-- Rollback de 20260825200000_fix_quarterly_per_consultant
--
-- Ambas as funções são CREATE OR REPLACE. Para reverter ao comportamento anterior
-- (QUARTERLY tratada como coletiva), reaplique as definições originais:
--   - sales_admin_set_goal_assignment_v2 → migration 20260825180000_sales_goal_assignment_overrides
--   - sales_admin_provision_defaults_v1  → migration 20260825130000_sales_admin_provision_defaults
-- Ou seja: re-execute o migration.sql desses dois diretórios.
--
-- Deixado como no-op guiado — reverter é raro e a correção é forward-only.
SELECT 1;

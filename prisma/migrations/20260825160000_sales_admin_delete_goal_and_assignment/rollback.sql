-- Rollback de 20260825160000_sales_admin_delete_goal_and_assignment
-- Remove apenas as funções. Não recria dados excluídos por elas (ação legítima do ADM).

DROP FUNCTION IF EXISTS public.sales_admin_delete_goal_v1(uuid);
DROP FUNCTION IF EXISTS public.sales_admin_delete_goal_assignment_v1(uuid);

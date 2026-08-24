BEGIN;

DROP TRIGGER IF EXISTS sales_goal_provisioning_key_immutable_trigger
  ON public.sales_goals;
DROP FUNCTION IF EXISTS public.sales_goal_provisioning_key_immutable();
DROP INDEX IF EXISTS public.sales_goals_tenant_provisioning_key_key;
ALTER TABLE public.sales_goals
  DROP CONSTRAINT IF EXISTS sales_goals_provisioning_key_check,
  DROP COLUMN IF EXISTS provisioning_key;

COMMIT;

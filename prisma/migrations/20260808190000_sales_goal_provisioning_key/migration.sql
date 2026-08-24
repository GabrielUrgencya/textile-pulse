BEGIN;

ALTER TABLE public.sales_goals
  ADD COLUMN provisioning_key text;

ALTER TABLE public.sales_goals
  ADD CONSTRAINT sales_goals_provisioning_key_check
  CHECK (
    provisioning_key IS NULL
    OR provisioning_key IN (
      'META_1',
      'META_2',
      'META_3',
      'CHALLENGE',
      'QUARTERLY',
      'COLLECTIVE'
    )
  );

CREATE UNIQUE INDEX sales_goals_tenant_provisioning_key_key
  ON public.sales_goals (tenant_id, provisioning_key)
  WHERE provisioning_key IS NOT NULL;

CREATE FUNCTION public.sales_goal_provisioning_key_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.provisioning_key IS NOT NULL
     AND NEW.provisioning_key IS DISTINCT FROM OLD.provisioning_key THEN
    RAISE EXCEPTION 'sales_goal_provisioning_key_immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sales_goal_provisioning_key_immutable() FROM PUBLIC;

CREATE TRIGGER sales_goal_provisioning_key_immutable_trigger
BEFORE UPDATE OF provisioning_key ON public.sales_goals
FOR EACH ROW
EXECUTE FUNCTION public.sales_goal_provisioning_key_immutable();

COMMENT ON COLUMN public.sales_goals.provisioning_key IS
  'Optional immutable identity used by the tenant provisioner. NULL identifies custom or not-yet-adopted legacy goals.';

COMMENT ON INDEX public.sales_goals_tenant_provisioning_key_key IS
  'Guarantees one canonical provisioned goal key per tenant while allowing multiple custom goals with NULL keys.';

COMMIT;

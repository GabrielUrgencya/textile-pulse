-- Story 9.5: explicit per-sector hourly target source.
-- Existing rows remain NULL (legacy) and the application resolves NULL as NONE.
ALTER TABLE "sector_targets" ADD COLUMN IF NOT EXISTS "hourly_target_mode" text;
ALTER TABLE "sector_targets" ALTER COLUMN "hourly_target_mode" SET DEFAULT 'NONE';

-- Business-data normalization is restricted to the disposable test tenant.
-- Both the pre-toggle and intermediate-toggle database states are supported.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sector_dashboard_configs'
      AND column_name = 'hourly_goal_enabled'
  ) THEN
    UPDATE "sector_targets" AS st
    SET "hourly_target_mode" = CASE
      WHEN st."hourly_target" IS NOT NULL AND st."hourly_target" > 0 THEN 'MANUAL'
      WHEN EXISTS (
        SELECT 1 FROM "sector_dashboard_configs" AS sdc
        WHERE sdc."tenant_id" = st."tenant_id"
          AND sdc."stage_id" = st."stage_id"
          AND sdc."hourly_goal_enabled" IS TRUE
      ) THEN 'AUTO'
      ELSE 'NONE'
    END
    FROM "tenants" AS t
    WHERE t."id" = st."tenant_id"
      AND t."slug" = 'fabrica-teste-31ykr'
      AND st."hourly_target_mode" IS NULL;
  ELSE
    UPDATE "sector_targets" AS st
    SET "hourly_target_mode" = CASE
      WHEN st."hourly_target" IS NOT NULL AND st."hourly_target" > 0 THEN 'MANUAL'
      ELSE 'NONE'
    END
    FROM "tenants" AS t
    WHERE t."id" = st."tenant_id"
      AND t."slug" = 'fabrica-teste-31ykr'
      AND st."hourly_target_mode" IS NULL;
  END IF;
END $$;

ALTER TABLE "sector_targets" DROP CONSTRAINT IF EXISTS "sector_targets_hourly_target_mode_valid";
ALTER TABLE "sector_targets" ADD CONSTRAINT "sector_targets_hourly_target_mode_valid" CHECK (
  "hourly_target_mode" IS NULL
  OR ("hourly_target_mode" IN ('NONE', 'AUTO') AND "hourly_target" IS NULL)
  OR ("hourly_target_mode" = 'MANUAL' AND "hourly_target" IS NOT NULL AND "hourly_target" > 0)
);

COMMENT ON COLUMN "sector_targets"."hourly_target_mode" IS
  'Fonte explicita da meta/hora: NONE, AUTO ou MANUAL. NULL legado e tratado como NONE pela aplicacao.';

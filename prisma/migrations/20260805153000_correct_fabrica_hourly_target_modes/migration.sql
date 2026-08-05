-- Corrective append-only migration for Story 9.5.
-- The historical hourly_goal_enabled column had DEFAULT true, so it cannot
-- prove an explicit AUTO choice. It is deliberately ignored here.
-- Business DML remains restricted to the disposable Fabrica Teste tenant.
UPDATE "sector_targets" AS st
SET "hourly_target_mode" = CASE
  WHEN st."hourly_target" IS NOT NULL AND st."hourly_target" > 0 THEN 'MANUAL'
  ELSE 'NONE'
END
FROM "tenants" AS t
WHERE t."id" = st."tenant_id"
  AND t."slug" = 'fabrica-teste-31ykr'
  AND st."hourly_target_mode" IS DISTINCT FROM CASE
    WHEN st."hourly_target" IS NOT NULL AND st."hourly_target" > 0 THEN 'MANUAL'
    ELSE 'NONE'
  END;

COMMENT ON COLUMN "sector_dashboard_configs"."hourly_goal_enabled" IS
  'DEPRECATED: historical flag with DEFAULT true; compatibility only and no functional effect on hourly targets.';

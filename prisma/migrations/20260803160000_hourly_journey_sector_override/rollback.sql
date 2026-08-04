-- Rollback da migration 20260803160000_hourly_journey_sector_override.
-- Reverte totalmente (colunas eram aditivas e nullable — nenhum dado existente é perdido
-- além dos overrides de jornada/meta-hora que forem preenchidos após a aplicação).

ALTER TABLE "sector_targets" DROP CONSTRAINT IF EXISTS "sector_targets_shift_times_hhmm";
ALTER TABLE "sector_targets" DROP CONSTRAINT IF EXISTS "sector_targets_hourly_target_positive";

ALTER TABLE "sector_targets"
  DROP COLUMN IF EXISTS "shift_start",
  DROP COLUMN IF EXISTS "shift_end",
  DROP COLUMN IF EXISTS "lunch_start",
  DROP COLUMN IF EXISTS "lunch_end",
  DROP COLUMN IF EXISTS "hourly_target";

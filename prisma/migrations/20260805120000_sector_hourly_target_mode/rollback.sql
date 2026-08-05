-- Reverts only Story 9.5 artifacts. Pre-existing columns and data remain intact.
ALTER TABLE "sector_targets" DROP CONSTRAINT IF EXISTS "sector_targets_hourly_target_mode_valid";
ALTER TABLE "sector_targets" DROP COLUMN IF EXISTS "hourly_target_mode";

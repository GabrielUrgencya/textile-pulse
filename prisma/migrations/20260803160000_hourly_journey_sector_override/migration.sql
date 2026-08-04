-- Frente 3 — Meta por hora por setor: override de JORNADA e META/HORA por setor.
-- Aditivo e reversível: todas as colunas NULLABLE (NULL = herda a jornada do tenant
-- em tenants.settings, ou deriva a meta/hora de daily_target ÷ horas úteis).
-- A jornada do TENANT (hourlyMetaEnabled, shiftStart/shiftEnd, lunchStart/lunchEnd) e o
-- calendário de dias úteis (work_days/holidays) ficam em tenants.settings (JSON) — sem DDL.
-- NÃO toca goal_deficits. NÃO altera dados existentes.

ALTER TABLE "sector_targets"
  ADD COLUMN IF NOT EXISTS "shift_start"   text,
  ADD COLUMN IF NOT EXISTS "shift_end"     text,
  ADD COLUMN IF NOT EXISTS "lunch_start"   text,
  ADD COLUMN IF NOT EXISTS "lunch_end"     text,
  ADD COLUMN IF NOT EXISTS "hourly_target" integer;

-- Validação leve de formato HH:MM (permite NULL). CHECKs idempotentes.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sector_targets_shift_times_hhmm') THEN
    ALTER TABLE "sector_targets" ADD CONSTRAINT "sector_targets_shift_times_hhmm" CHECK (
      ("shift_start" IS NULL OR "shift_start" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') AND
      ("shift_end"   IS NULL OR "shift_end"   ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') AND
      ("lunch_start" IS NULL OR "lunch_start" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') AND
      ("lunch_end"   IS NULL OR "lunch_end"   ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sector_targets_hourly_target_positive') THEN
    ALTER TABLE "sector_targets" ADD CONSTRAINT "sector_targets_hourly_target_positive" CHECK (
      "hourly_target" IS NULL OR "hourly_target" > 0
    );
  END IF;
END $$;

COMMENT ON COLUMN "sector_targets"."shift_start"   IS 'Override de início da jornada do setor (HH:MM). NULL = herda tenants.settings.shiftStart.';
COMMENT ON COLUMN "sector_targets"."shift_end"     IS 'Override de fim da jornada do setor (HH:MM). NULL = herda tenants.settings.shiftEnd.';
COMMENT ON COLUMN "sector_targets"."lunch_start"   IS 'Override de início do almoço do setor (HH:MM). NULL = herda tenants.settings.lunchStart (ou sem almoço).';
COMMENT ON COLUMN "sector_targets"."lunch_end"     IS 'Override de fim do almoço do setor (HH:MM). NULL = herda tenants.settings.lunchEnd.';
COMMENT ON COLUMN "sector_targets"."hourly_target" IS 'Meta/hora manual do setor. NULL = deriva de daily_target ÷ horas úteis da jornada efetiva.';

-- Frente 2: seletor de meta por hora POR SETOR.
-- Cada setor decide se tem meta por hora. Default true = comportamento atual
-- (todos os setores com jornada mostram a meta da hora). Setor com false → a TV
-- cai no fallback já existente (Dia como herói), sem gerar nem mostrar meta de hora.
ALTER TABLE "sector_dashboard_configs"
  ADD COLUMN IF NOT EXISTS "hourly_goal_enabled" BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN "sector_dashboard_configs"."hourly_goal_enabled" IS
  'Frente 2: este setor tem meta por hora na TV? false = sem anel de hora (Dia vira herói).';

-- ROLLBACK (manual):
--   ALTER TABLE "sector_dashboard_configs" DROP COLUMN IF EXISTS "hourly_goal_enabled";

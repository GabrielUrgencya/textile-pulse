-- Épico "Metas/KPIs por Setor & TV" — fundação de dados (decisões @architect)
-- 1) sector_targets: metas semanal/mensal explícitas por setor (etapa).
-- 2) daily_achievements: registro IDEMPOTENTE do feito do dia (meta batida) por usuário e por setor.
-- ADITIVA. Idempotente (ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS / DROP POLICY IF EXISTS).
-- RLS tenant-scoped via auth_tenant_id() (mesmo padrão da 8.21).

-- ============================================================
-- 1) sector_targets — metas por período (semanal/mensal) por setor
--    NULL = não configurado (a TV cai no derivado da diária como fallback suave).
-- ============================================================
ALTER TABLE "public"."sector_targets"
  ADD COLUMN IF NOT EXISTS "weekly_target"  INTEGER,
  ADD COLUMN IF NOT EXISTS "monthly_target" INTEGER;

ALTER TABLE "public"."sector_targets" DROP CONSTRAINT IF EXISTS "sector_targets_weekly_chk";
ALTER TABLE "public"."sector_targets"
  ADD CONSTRAINT "sector_targets_weekly_chk"  CHECK ("weekly_target"  IS NULL OR "weekly_target"  >= 0);
ALTER TABLE "public"."sector_targets" DROP CONSTRAINT IF EXISTS "sector_targets_monthly_chk";
ALTER TABLE "public"."sector_targets"
  ADD CONSTRAINT "sector_targets_monthly_chk" CHECK ("monthly_target" IS NULL OR "monthly_target" >= 0);

COMMENT ON COLUMN "public"."sector_targets"."weekly_target"  IS 'Meta semanal do setor (NULL = não configurada; TV deriva da diária).';
COMMENT ON COLUMN "public"."sector_targets"."monthly_target" IS 'Meta mensal do setor (NULL = não configurada; TV deriva da diária).';

-- ============================================================
-- 2) daily_achievements — feito do dia (meta batida), idempotente
--    scope='USER'   -> user_id preenchido (colaborador bateu a meta individual)
--    scope='SECTOR' -> user_id NULL       (setor inteiro bateu a meta do dia)
-- ============================================================
CREATE TABLE IF NOT EXISTS "public"."daily_achievements" (
  "id"               UUID        NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"        UUID        NOT NULL,
  "achieved_date"    DATE        NOT NULL,
  "scope"            TEXT        NOT NULL,
  "stage_id"         UUID        NOT NULL,
  "user_id"          UUID,
  "target_snapshot"  INTEGER,
  "progress_snapshot" NUMERIC(10,2),
  "created_at"       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "daily_achievements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "daily_achievements_scope_chk" CHECK ("scope" IN ('USER','SECTOR')),
  -- Coerência: USER exige user_id; SECTOR exige user_id NULL
  CONSTRAINT "daily_achievements_scope_user_chk" CHECK (
    ("scope" = 'USER'   AND "user_id" IS NOT NULL) OR
    ("scope" = 'SECTOR' AND "user_id" IS NULL)
  ),
  CONSTRAINT "daily_achievements_tenant_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "public"."tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "daily_achievements_stage_fkey" FOREIGN KEY ("stage_id")
    REFERENCES "public"."stages"("id") ON DELETE CASCADE,
  CONSTRAINT "daily_achievements_user_fkey" FOREIGN KEY ("user_id")
    REFERENCES "public"."profiles"("id") ON DELETE CASCADE
);

-- Unicidade idempotente p/ ON CONFLICT DO NOTHING (user_id NULL → sentinela)
CREATE UNIQUE INDEX IF NOT EXISTS "daily_achievements_unique"
  ON "public"."daily_achievements" (
    "tenant_id", "achieved_date", "scope", "stage_id",
    (COALESCE("user_id", '00000000-0000-0000-0000-000000000000'::uuid))
  );

-- Índices de leitura (TV e dashboard consultam por tenant+data, e por etapa)
CREATE INDEX IF NOT EXISTS "idx_daily_achievements_tenant_date"
  ON "public"."daily_achievements" ("tenant_id", "achieved_date");
CREATE INDEX IF NOT EXISTS "idx_daily_achievements_tenant_date_stage"
  ON "public"."daily_achievements" ("tenant_id", "achieved_date", "stage_id");

COMMENT ON TABLE "public"."daily_achievements" IS 'Feito do dia (meta batida) idempotente: scope USER (colaborador) ou SECTOR (etapa). Alimenta celebração na TV e estado "Concluída" no dashboard.';

-- ============================================================
-- RLS — tenant-scoped (escrita real vem do /api/scan via service_role)
-- ============================================================
ALTER TABLE "public"."daily_achievements" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily_achievements_select" ON "public"."daily_achievements";
CREATE POLICY "daily_achievements_select" ON "public"."daily_achievements" FOR SELECT USING (tenant_id = auth_tenant_id());
DROP POLICY IF EXISTS "daily_achievements_insert" ON "public"."daily_achievements";
CREATE POLICY "daily_achievements_insert" ON "public"."daily_achievements" FOR INSERT WITH CHECK (tenant_id = auth_tenant_id());
DROP POLICY IF EXISTS "daily_achievements_update" ON "public"."daily_achievements";
CREATE POLICY "daily_achievements_update" ON "public"."daily_achievements" FOR UPDATE USING (tenant_id = auth_tenant_id()) WITH CHECK (tenant_id = auth_tenant_id());
DROP POLICY IF EXISTS "daily_achievements_delete" ON "public"."daily_achievements";
CREATE POLICY "daily_achievements_delete" ON "public"."daily_achievements" FOR DELETE USING (tenant_id = auth_tenant_id());

-- Story 8.21 — Meta por etapa×referência + meta por setor/usuário
-- 3 tabelas: matriz de coeficientes (referência×etapa), metas por setor (etapa),
-- e override por usuário. RLS tenant-scoped (gate admin via API settings:manage).
-- Aplicada via Supabase Management API em 2026-06-19 (banco coxfzplrsfzbhzuwdfnw).

-- ============================================================
-- 1) reference_stage_targets — coeficiente por referência × etapa
-- ============================================================
CREATE TABLE IF NOT EXISTS "public"."reference_stage_targets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "reference" TEXT NOT NULL,
  "stage_id" UUID NOT NULL,
  "coefficient" NUMERIC(6,2) NOT NULL DEFAULT 1.0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reference_stage_targets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reference_stage_targets_unique" UNIQUE ("tenant_id", "reference", "stage_id"),
  CONSTRAINT "reference_stage_targets_tenant_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "public"."tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "reference_stage_targets_stage_fkey" FOREIGN KEY ("stage_id")
    REFERENCES "public"."stages"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_rst_tenant" ON "public"."reference_stage_targets"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rst_stage" ON "public"."reference_stage_targets"("stage_id");

-- ============================================================
-- 2) sector_targets — meta diária por setor (= etapa) com unidade
-- ============================================================
CREATE TABLE IF NOT EXISTS "public"."sector_targets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "stage_id" UUID NOT NULL,
  "daily_target" INTEGER NOT NULL,
  "unit" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sector_targets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sector_targets_unique" UNIQUE ("tenant_id", "stage_id"),
  CONSTRAINT "sector_targets_daily_chk" CHECK ("daily_target" >= 0),
  CONSTRAINT "sector_targets_tenant_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "public"."tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "sector_targets_stage_fkey" FOREIGN KEY ("stage_id")
    REFERENCES "public"."stages"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_sector_targets_tenant" ON "public"."sector_targets"("tenant_id");

-- ============================================================
-- 3) user_targets — override individual por usuário (carrega a etapa)
-- ============================================================
CREATE TABLE IF NOT EXISTS "public"."user_targets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "stage_id" UUID NOT NULL,
  "daily_target" INTEGER,
  "unit" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_targets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_targets_unique" UNIQUE ("tenant_id", "user_id"),
  CONSTRAINT "user_targets_daily_chk" CHECK ("daily_target" IS NULL OR "daily_target" >= 0),
  CONSTRAINT "user_targets_tenant_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "public"."tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "user_targets_user_fkey" FOREIGN KEY ("user_id")
    REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
  CONSTRAINT "user_targets_stage_fkey" FOREIGN KEY ("stage_id")
    REFERENCES "public"."stages"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_user_targets_tenant" ON "public"."user_targets"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_user_targets_user" ON "public"."user_targets"("user_id");

-- ============================================================
-- RLS — tenant-scoped (gate admin permanece na API via settings:manage)
-- ============================================================
ALTER TABLE "public"."reference_stage_targets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."sector_targets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."user_targets" ENABLE ROW LEVEL SECURITY;

-- reference_stage_targets
DROP POLICY IF EXISTS "rst_select" ON "public"."reference_stage_targets";
CREATE POLICY "rst_select" ON "public"."reference_stage_targets" FOR SELECT USING (tenant_id = auth_tenant_id());
DROP POLICY IF EXISTS "rst_insert" ON "public"."reference_stage_targets";
CREATE POLICY "rst_insert" ON "public"."reference_stage_targets" FOR INSERT WITH CHECK (tenant_id = auth_tenant_id());
DROP POLICY IF EXISTS "rst_update" ON "public"."reference_stage_targets";
CREATE POLICY "rst_update" ON "public"."reference_stage_targets" FOR UPDATE USING (tenant_id = auth_tenant_id()) WITH CHECK (tenant_id = auth_tenant_id());
DROP POLICY IF EXISTS "rst_delete" ON "public"."reference_stage_targets";
CREATE POLICY "rst_delete" ON "public"."reference_stage_targets" FOR DELETE USING (tenant_id = auth_tenant_id());

-- sector_targets
DROP POLICY IF EXISTS "sector_targets_select" ON "public"."sector_targets";
CREATE POLICY "sector_targets_select" ON "public"."sector_targets" FOR SELECT USING (tenant_id = auth_tenant_id());
DROP POLICY IF EXISTS "sector_targets_insert" ON "public"."sector_targets";
CREATE POLICY "sector_targets_insert" ON "public"."sector_targets" FOR INSERT WITH CHECK (tenant_id = auth_tenant_id());
DROP POLICY IF EXISTS "sector_targets_update" ON "public"."sector_targets";
CREATE POLICY "sector_targets_update" ON "public"."sector_targets" FOR UPDATE USING (tenant_id = auth_tenant_id()) WITH CHECK (tenant_id = auth_tenant_id());
DROP POLICY IF EXISTS "sector_targets_delete" ON "public"."sector_targets";
CREATE POLICY "sector_targets_delete" ON "public"."sector_targets" FOR DELETE USING (tenant_id = auth_tenant_id());

-- user_targets
DROP POLICY IF EXISTS "user_targets_select" ON "public"."user_targets";
CREATE POLICY "user_targets_select" ON "public"."user_targets" FOR SELECT USING (tenant_id = auth_tenant_id());
DROP POLICY IF EXISTS "user_targets_insert" ON "public"."user_targets";
CREATE POLICY "user_targets_insert" ON "public"."user_targets" FOR INSERT WITH CHECK (tenant_id = auth_tenant_id());
DROP POLICY IF EXISTS "user_targets_update" ON "public"."user_targets";
CREATE POLICY "user_targets_update" ON "public"."user_targets" FOR UPDATE USING (tenant_id = auth_tenant_id()) WITH CHECK (tenant_id = auth_tenant_id());
DROP POLICY IF EXISTS "user_targets_delete" ON "public"."user_targets";
CREATE POLICY "user_targets_delete" ON "public"."user_targets" FOR DELETE USING (tenant_id = auth_tenant_id());

COMMENT ON TABLE "public"."reference_stage_targets" IS 'Story 8.21: coeficiente de meta por referencia x etapa.';
COMMENT ON TABLE "public"."sector_targets" IS 'Story 8.21: meta diaria por setor (etapa) com unidade.';
COMMENT ON TABLE "public"."user_targets" IS 'Story 8.21: override de meta por usuario + etapa atribuida.';

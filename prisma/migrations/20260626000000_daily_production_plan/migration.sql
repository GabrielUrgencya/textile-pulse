-- PARTE 2 — Plano Diário de Produção ("hoje você precisa produzir X")
-- Duas tabelas tenant-scoped. RLS via helper auth_tenant_id() (padrão do projeto,
-- ver 20260619010000). Itens escopados pela cadeia plan -> daily_plans (como lots -> po).
--
-- 100% ADITIVA e idempotente (IF NOT EXISTS / DROP POLICY IF EXISTS).

-- ============================================================
-- 1) daily_plans — um plano por dia (tenant + data únicos)
-- ============================================================
CREATE TABLE IF NOT EXISTS "public"."daily_plans" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"       UUID NOT NULL,
  "plan_date"       DATE NOT NULL,
  "target_override" NUMERIC(10,2),
  "notes"           TEXT,
  "created_by"      UUID,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "daily_plans_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "daily_plans_unique" UNIQUE ("tenant_id", "plan_date"),
  CONSTRAINT "daily_plans_tenant_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "public"."tenants"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_daily_plans_tenant" ON "public"."daily_plans"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_daily_plans_date" ON "public"."daily_plans"("plan_date");

COMMENT ON TABLE "public"."daily_plans" IS 'Plano diário de produção (PARTE 2). 1 por tenant/data.';
COMMENT ON COLUMN "public"."daily_plans"."target_override" IS 'Meta do dia editada manualmente; se NULL, usa a soma dos itens.';

-- ============================================================
-- 2) daily_plan_items — itens do plano (ref + cor/tamanho + qtd)
-- ============================================================
CREATE TABLE IF NOT EXISTS "public"."daily_plan_items" (
  "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
  "plan_id"    UUID NOT NULL,
  "reference"  TEXT,
  "color"      TEXT,
  "size_label" TEXT,
  "quantity"   INTEGER,
  "meta_value" NUMERIC(10,2),
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "daily_plan_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "daily_plan_items_plan_fkey" FOREIGN KEY ("plan_id")
    REFERENCES "public"."daily_plans"("id") ON DELETE CASCADE,
  CONSTRAINT "daily_plan_items_qty_chk" CHECK ("quantity" IS NULL OR "quantity" >= 0)
);
CREATE INDEX IF NOT EXISTS "idx_daily_plan_items_plan" ON "public"."daily_plan_items"("plan_id");

COMMENT ON TABLE "public"."daily_plan_items" IS 'Itens do plano diário: referência + cor/tamanho + quantidade + contribuição de meta.';
COMMENT ON COLUMN "public"."daily_plan_items"."size_label" IS 'Tamanho/escopo livre: "completo", "G", "2 cores", etc.';
COMMENT ON COLUMN "public"."daily_plan_items"."meta_value" IS 'Contribuição do item para a meta do dia.';

-- ============================================================
-- 3) RLS — tenant-scoped (helper auth_tenant_id())
-- ============================================================
ALTER TABLE "public"."daily_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."daily_plan_items" ENABLE ROW LEVEL SECURITY;

-- daily_plans: tenant direto
DROP POLICY IF EXISTS "daily_plans_select" ON "public"."daily_plans";
CREATE POLICY "daily_plans_select" ON "public"."daily_plans" FOR SELECT USING (tenant_id = auth_tenant_id());
DROP POLICY IF EXISTS "daily_plans_insert" ON "public"."daily_plans";
CREATE POLICY "daily_plans_insert" ON "public"."daily_plans" FOR INSERT WITH CHECK (tenant_id = auth_tenant_id());
DROP POLICY IF EXISTS "daily_plans_update" ON "public"."daily_plans";
CREATE POLICY "daily_plans_update" ON "public"."daily_plans" FOR UPDATE USING (tenant_id = auth_tenant_id()) WITH CHECK (tenant_id = auth_tenant_id());
DROP POLICY IF EXISTS "daily_plans_delete" ON "public"."daily_plans";
CREATE POLICY "daily_plans_delete" ON "public"."daily_plans" FOR DELETE USING (tenant_id = auth_tenant_id());

-- daily_plan_items: cadeia plan -> daily_plans.tenant_id
DROP POLICY IF EXISTS "daily_plan_items_select" ON "public"."daily_plan_items";
CREATE POLICY "daily_plan_items_select" ON "public"."daily_plan_items" FOR SELECT
  USING (EXISTS (SELECT 1 FROM "public"."daily_plans" p WHERE p.id = plan_id AND p.tenant_id = auth_tenant_id()));
DROP POLICY IF EXISTS "daily_plan_items_insert" ON "public"."daily_plan_items";
CREATE POLICY "daily_plan_items_insert" ON "public"."daily_plan_items" FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM "public"."daily_plans" p WHERE p.id = plan_id AND p.tenant_id = auth_tenant_id()));
DROP POLICY IF EXISTS "daily_plan_items_update" ON "public"."daily_plan_items";
CREATE POLICY "daily_plan_items_update" ON "public"."daily_plan_items" FOR UPDATE
  USING (EXISTS (SELECT 1 FROM "public"."daily_plans" p WHERE p.id = plan_id AND p.tenant_id = auth_tenant_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM "public"."daily_plans" p WHERE p.id = plan_id AND p.tenant_id = auth_tenant_id()));
DROP POLICY IF EXISTS "daily_plan_items_delete" ON "public"."daily_plan_items";
CREATE POLICY "daily_plan_items_delete" ON "public"."daily_plan_items" FOR DELETE
  USING (EXISTS (SELECT 1 FROM "public"."daily_plans" p WHERE p.id = plan_id AND p.tenant_id = auth_tenant_id()));

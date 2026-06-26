-- Plano do Dia — público por plano (evolução da 8.27)
-- Permite VÁRIOS planos por dia, cada um geral (todos) ou restrito a membros.
-- ADITIVA + remoção de constraint. Idempotente. Retrocompatível (planos existentes = geral).

-- ============================================================
-- 1) daily_plans: remove unicidade por dia, add name + is_general
-- ============================================================
ALTER TABLE "public"."daily_plans" DROP CONSTRAINT IF EXISTS "daily_plans_unique";

ALTER TABLE "public"."daily_plans"
  ADD COLUMN IF NOT EXISTS "name"       TEXT,
  ADD COLUMN IF NOT EXISTS "is_general" BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN "public"."daily_plans"."name"       IS 'Rótulo opcional do plano (ex.: "Plano Andiara").';
COMMENT ON COLUMN "public"."daily_plans"."is_general" IS 'true = visível a todos; false = restrito aos membros em daily_plan_members.';

-- ============================================================
-- 2) daily_plan_members: público restrito do plano
-- ============================================================
CREATE TABLE IF NOT EXISTS "public"."daily_plan_members" (
  "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
  "plan_id"    UUID NOT NULL,
  "profile_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "daily_plan_members_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "daily_plan_members_unique" UNIQUE ("plan_id", "profile_id"),
  CONSTRAINT "daily_plan_members_plan_fkey" FOREIGN KEY ("plan_id")
    REFERENCES "public"."daily_plans"("id") ON DELETE CASCADE,
  CONSTRAINT "daily_plan_members_profile_fkey" FOREIGN KEY ("profile_id")
    REFERENCES "public"."profiles"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_daily_plan_members_plan" ON "public"."daily_plan_members"("plan_id");
CREATE INDEX IF NOT EXISTS "idx_daily_plan_members_profile" ON "public"."daily_plan_members"("profile_id");

COMMENT ON TABLE "public"."daily_plan_members" IS 'Membros atrelados a um plano restrito (is_general=false).';

-- ============================================================
-- 3) RLS — tenant-scoped pela cadeia plan -> daily_plans
-- ============================================================
ALTER TABLE "public"."daily_plan_members" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily_plan_members_select" ON "public"."daily_plan_members";
CREATE POLICY "daily_plan_members_select" ON "public"."daily_plan_members" FOR SELECT
  USING (EXISTS (SELECT 1 FROM "public"."daily_plans" p WHERE p.id = plan_id AND p.tenant_id = auth_tenant_id()));
DROP POLICY IF EXISTS "daily_plan_members_insert" ON "public"."daily_plan_members";
CREATE POLICY "daily_plan_members_insert" ON "public"."daily_plan_members" FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM "public"."daily_plans" p WHERE p.id = plan_id AND p.tenant_id = auth_tenant_id()));
DROP POLICY IF EXISTS "daily_plan_members_update" ON "public"."daily_plan_members";
CREATE POLICY "daily_plan_members_update" ON "public"."daily_plan_members" FOR UPDATE
  USING (EXISTS (SELECT 1 FROM "public"."daily_plans" p WHERE p.id = plan_id AND p.tenant_id = auth_tenant_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM "public"."daily_plans" p WHERE p.id = plan_id AND p.tenant_id = auth_tenant_id()));
DROP POLICY IF EXISTS "daily_plan_members_delete" ON "public"."daily_plan_members";
CREATE POLICY "daily_plan_members_delete" ON "public"."daily_plan_members" FOR DELETE
  USING (EXISTS (SELECT 1 FROM "public"."daily_plans" p WHERE p.id = plan_id AND p.tenant_id = auth_tenant_id()));

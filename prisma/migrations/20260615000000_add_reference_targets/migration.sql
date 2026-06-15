-- Story 8.13 — Cadastro de Referência com Meta
-- Tabela reference_targets: coeficiente de meta (peso por modelo) por referência.
-- Fonte da verdade para production_orders.meta_coefficient (snapshot na criação da OP).
-- Aplicada via Supabase Management API em 2026-06-15 (banco remoto coxfzplrsfzbhzuwdfnw).

CREATE TABLE IF NOT EXISTS "public"."reference_targets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "meta_coefficient" DECIMAL(4,2) NOT NULL DEFAULT 1.0,
    "description" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reference_targets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reference_targets_tenant_reference_key" UNIQUE ("tenant_id", "reference"),
    CONSTRAINT "reference_targets_tenant_id_fkey" FOREIGN KEY ("tenant_id")
        REFERENCES "public"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_reference_targets_tenant" ON "public"."reference_targets"("tenant_id");

-- RLS: isolamento por tenant (mesmo padrão de stages — auth_tenant_id()).
ALTER TABLE "public"."reference_targets" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reference_targets_select" ON "public"."reference_targets";
CREATE POLICY "reference_targets_select" ON "public"."reference_targets"
    FOR SELECT USING (tenant_id = auth_tenant_id());

DROP POLICY IF EXISTS "reference_targets_insert" ON "public"."reference_targets";
CREATE POLICY "reference_targets_insert" ON "public"."reference_targets"
    FOR INSERT WITH CHECK (tenant_id = auth_tenant_id());

DROP POLICY IF EXISTS "reference_targets_update" ON "public"."reference_targets";
CREATE POLICY "reference_targets_update" ON "public"."reference_targets"
    FOR UPDATE USING (tenant_id = auth_tenant_id()) WITH CHECK (tenant_id = auth_tenant_id());

DROP POLICY IF EXISTS "reference_targets_delete" ON "public"."reference_targets";
CREATE POLICY "reference_targets_delete" ON "public"."reference_targets"
    FOR DELETE USING (tenant_id = auth_tenant_id());

COMMENT ON TABLE "public"."reference_targets" IS 'Story 8.13: coeficiente de meta por referencia (peso por modelo). Fonte da verdade para meta_coefficient da OP.';

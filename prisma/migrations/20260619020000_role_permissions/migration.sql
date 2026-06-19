-- Story 8.22 — RBAC dinâmico: overrides de permissão por cargo
-- Guarda apenas EXCEÇÕES ao padrão do código (ROLE_PERMISSIONS).
-- Efetivo = default (código) ⊕ override (allowed true adiciona / false remove).
-- RLS: SELECT tenant-scoped (o app lê as permissões do usuário); escrita gated admin na API.
-- Aplicada via Supabase Management API em 2026-06-19 (banco coxfzplrsfzbhzuwdfnw).

CREATE TABLE IF NOT EXISTS "public"."role_permissions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "role" TEXT NOT NULL,
  "permission" TEXT NOT NULL,
  "allowed" BOOLEAN NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "role_permissions_unique" UNIQUE ("tenant_id", "role", "permission"),
  CONSTRAINT "role_permissions_role_chk" CHECK ("role" IN ('ADMIN','GERENTE','COORDENADOR','OPERADOR')),
  CONSTRAINT "role_permissions_tenant_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "public"."tenants"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_role_permissions_tenant" ON "public"."role_permissions"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_role_permissions_lookup" ON "public"."role_permissions"("tenant_id", "role");

ALTER TABLE "public"."role_permissions" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "role_permissions_select" ON "public"."role_permissions";
CREATE POLICY "role_permissions_select" ON "public"."role_permissions"
  FOR SELECT USING (tenant_id = auth_tenant_id());

DROP POLICY IF EXISTS "role_permissions_insert" ON "public"."role_permissions";
CREATE POLICY "role_permissions_insert" ON "public"."role_permissions"
  FOR INSERT WITH CHECK (tenant_id = auth_tenant_id());

DROP POLICY IF EXISTS "role_permissions_update" ON "public"."role_permissions";
CREATE POLICY "role_permissions_update" ON "public"."role_permissions"
  FOR UPDATE USING (tenant_id = auth_tenant_id()) WITH CHECK (tenant_id = auth_tenant_id());

DROP POLICY IF EXISTS "role_permissions_delete" ON "public"."role_permissions";
CREATE POLICY "role_permissions_delete" ON "public"."role_permissions"
  FOR DELETE USING (tenant_id = auth_tenant_id());

COMMENT ON TABLE "public"."role_permissions" IS 'Story 8.22: overrides de permissão por cargo (RBAC dinâmico). Default no código.';

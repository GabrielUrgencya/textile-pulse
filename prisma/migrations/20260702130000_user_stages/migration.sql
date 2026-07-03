-- Story 9.4 — Atribuição de setor(es) por usuário.
-- Vínculo N:N usuário↔etapa (setor). Um usuário pode ter 1+ setores.
-- O enforcement de bipagem (/api/scan) só permite bipar em etapas do conjunto.
-- RLS tenant-scoped (mesmo padrão de user_targets); escrita restrita a admin
-- na camada de API (can(user, "users:manage")).

CREATE TABLE IF NOT EXISTS "public"."user_stages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "stage_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "user_stages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_stages_unique" UNIQUE ("user_id", "stage_id"),
  CONSTRAINT "user_stages_tenant_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "public"."tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "user_stages_user_fkey" FOREIGN KEY ("user_id")
    REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
  CONSTRAINT "user_stages_stage_fkey" FOREIGN KEY ("stage_id")
    REFERENCES "public"."stages"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_user_stages_tenant" ON "public"."user_stages"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_user_stages_user" ON "public"."user_stages"("user_id");
CREATE INDEX IF NOT EXISTS "idx_user_stages_stage" ON "public"."user_stages"("stage_id");

ALTER TABLE "public"."user_stages" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_stages_select" ON "public"."user_stages";
CREATE POLICY "user_stages_select" ON "public"."user_stages" FOR SELECT USING (tenant_id = auth_tenant_id());
DROP POLICY IF EXISTS "user_stages_insert" ON "public"."user_stages";
CREATE POLICY "user_stages_insert" ON "public"."user_stages" FOR INSERT WITH CHECK (tenant_id = auth_tenant_id());
DROP POLICY IF EXISTS "user_stages_update" ON "public"."user_stages";
CREATE POLICY "user_stages_update" ON "public"."user_stages" FOR UPDATE USING (tenant_id = auth_tenant_id()) WITH CHECK (tenant_id = auth_tenant_id());
DROP POLICY IF EXISTS "user_stages_delete" ON "public"."user_stages";
CREATE POLICY "user_stages_delete" ON "public"."user_stages" FOR DELETE USING (tenant_id = auth_tenant_id());

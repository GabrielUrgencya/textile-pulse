-- CreateTable: kiosk_tokens (Story 5.8 — Item 8 v2.1)
CREATE TABLE IF NOT EXISTS "kiosk_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "token" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'dashboard',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "kiosk_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "kiosk_tokens_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "kiosk_tokens_token_key" ON "kiosk_tokens"("token");

-- RLS: kiosk_tokens (AC8 — tenant isolation)
ALTER TABLE "kiosk_tokens" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kiosk_tokens_select_policy"
    ON "kiosk_tokens" FOR SELECT
    USING (tenant_id = auth_tenant_id());

CREATE POLICY "kiosk_tokens_insert_policy"
    ON "kiosk_tokens" FOR INSERT
    WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY "kiosk_tokens_update_policy"
    ON "kiosk_tokens" FOR UPDATE
    USING (tenant_id = auth_tenant_id());

CREATE POLICY "kiosk_tokens_delete_policy"
    ON "kiosk_tokens" FOR DELETE
    USING (tenant_id = auth_tenant_id());

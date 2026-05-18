-- Story 6.1 T1: Create faction_tokens table + index
-- Pattern: based on kiosk_tokens with PIN auth + faction isolation

-- CreateTable
CREATE TABLE "faction_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "faction_id" UUID NOT NULL,
    "token" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pin_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_accessed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "faction_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique token for lookup
ALTER TABLE "faction_tokens" ADD CONSTRAINT "faction_tokens_token_key" UNIQUE ("token");

-- CreateIndex: fast lookup of active tokens (AC3)
CREATE INDEX "idx_faction_tokens_token" ON "faction_tokens" ("token") WHERE "is_active" = true;

-- AddForeignKey: tenant
ALTER TABLE "faction_tokens" ADD CONSTRAINT "faction_tokens_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: faction
ALTER TABLE "faction_tokens" ADD CONSTRAINT "faction_tokens_faction_id_fkey"
    FOREIGN KEY ("faction_id") REFERENCES "factions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enable RLS
ALTER TABLE "faction_tokens" ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Story 6.1 T2 (AC2): RLS policy — admin-only access
-- Only ADMIN users of the same tenant can manage faction_tokens.
-- Faction login uses service_role (bypasses RLS), so no faction
-- policy needed here.
-- ============================================================

-- Helper: extract role from JWT app_metadata
CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'role');
$$;

COMMENT ON FUNCTION public.auth_user_role() IS 'Extracts user role from JWT app_metadata. Used in RLS policies that require role-based access control.';

-- Policy: admins can SELECT faction_tokens of their tenant
CREATE POLICY "faction_tokens_admin_only"
    ON "faction_tokens" FOR ALL
    USING (
        tenant_id = auth_tenant_id()
        AND auth_user_role() = 'ADMIN'
    )
    WITH CHECK (
        tenant_id = auth_tenant_id()
        AND auth_user_role() = 'ADMIN'
    );

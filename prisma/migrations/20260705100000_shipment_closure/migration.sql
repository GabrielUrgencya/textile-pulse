-- Épico Robustez de Remessas (F2): estado final CLOSED + timeline de eventos.

-- 1. Novo valor do enum (aditivo, seguro)
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'CLOSED';

-- 2. Colunas de encerramento em faction_shipments
ALTER TABLE "faction_shipments"
  ADD COLUMN IF NOT EXISTS "closed_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "closed_by" TEXT,
  ADD COLUMN IF NOT EXISTS "status_before_close" TEXT;

-- 3. Timeline de eventos da remessa (F3: histórico + observações)
CREATE TABLE IF NOT EXISTS "shipment_events" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "shipment_id" UUID NOT NULL REFERENCES "faction_shipments"("id") ON DELETE CASCADE,
  "event_type" VARCHAR(32) NOT NULL,
  "actor_type" VARCHAR(8) NOT NULL DEFAULT 'SYSTEM' CHECK ("actor_type" IN ('ADMIN','FACTION','SYSTEM')),
  "actor_name" TEXT,
  "visible_to_faction" BOOLEAN NOT NULL DEFAULT true,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "shipment_events_shipment_idx"
  ON "shipment_events" ("shipment_id", "created_at");
CREATE INDEX IF NOT EXISTS "shipment_events_tenant_idx"
  ON "shipment_events" ("tenant_id");

ALTER TABLE "shipment_events" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shipment_events_select" ON "shipment_events";
CREATE POLICY "shipment_events_select" ON "shipment_events" FOR SELECT
  USING ("tenant_id" = auth_tenant_id());
DROP POLICY IF EXISTS "shipment_events_insert" ON "shipment_events";
CREATE POLICY "shipment_events_insert" ON "shipment_events" FOR INSERT
  WITH CHECK ("tenant_id" = auth_tenant_id());

COMMENT ON TABLE "shipment_events" IS 'Timeline da remessa: CREATED, SENT, CONFIRMED, RETURN_DECLARED, RECEIVED, RECONCILED, PAYMENT, NOTE, DEADLINE_CHANGED, CLOSED, REOPENED. Observações = event_type NOTE (visible_to_faction controla exposição no portal).';

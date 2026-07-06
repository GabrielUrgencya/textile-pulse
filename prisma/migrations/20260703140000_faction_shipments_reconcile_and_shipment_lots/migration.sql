-- Frente C (Facções) — Reconciliar faction_shipments + criar junção shipment_lots.
-- BUG: o POST /api/shipments (código atual) insere tenant_id/total_quantity/
-- expected_return em faction_shipments e insere em shipment_lots, mas o BANCO
-- estava no schema antigo (lot_id/quantity_sent/expected_return_at NOT NULL) e
-- shipment_lots NEM existia → criar remessa SEMPRE falhava.
-- faction_shipments está VAZIO → DDL segura. RLS de faction_shipments (via
-- factions.tenant_id) é preservada. Rollback: ver fim do arquivo.

-- 1) Colunas novas esperadas pela API
ALTER TABLE "faction_shipments"
  ADD COLUMN IF NOT EXISTS "tenant_id" UUID,
  ADD COLUMN IF NOT EXISTS "total_quantity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "expected_return" TIMESTAMPTZ;

-- Backfill tenant_id a partir da facção (tabela vazia hoje; correto se houver dados)
UPDATE "faction_shipments" fs
  SET "tenant_id" = f."tenant_id"
  FROM "factions" f
  WHERE f."id" = fs."faction_id" AND fs."tenant_id" IS NULL;

-- FK de integridade para tenant_id
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'faction_shipments_tenant_fkey') THEN
    ALTER TABLE "faction_shipments"
      ADD CONSTRAINT "faction_shipments_tenant_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "idx_faction_shipments_tenant" ON "faction_shipments"("tenant_id");

-- 2) Relaxar NOT NULL das colunas legadas (a API não as preenche; a junção guarda os lotes)
ALTER TABLE "faction_shipments"
  ALTER COLUMN "lot_id" DROP NOT NULL,
  ALTER COLUMN "quantity_sent" DROP NOT NULL,
  ALTER COLUMN "expected_return_at" DROP NOT NULL;

-- 3) Junção remessa↔lotes: 1 remessa contém N lotes/sublotes.
--    Cada sublote (fracionamento por cor) é um lot com barcode próprio, então
--    preto→facção A e branco→facção B são remessas distintas, cada uma com seus lotes.
CREATE TABLE IF NOT EXISTS "shipment_lots" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shipment_id" UUID NOT NULL,
  "lot_id" UUID NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "shipment_lots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shipment_lots_unique" UNIQUE ("shipment_id", "lot_id"),
  CONSTRAINT "shipment_lots_shipment_fkey" FOREIGN KEY ("shipment_id")
    REFERENCES "faction_shipments"("id") ON DELETE CASCADE,
  CONSTRAINT "shipment_lots_lot_fkey" FOREIGN KEY ("lot_id")
    REFERENCES "lots"("id") ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "idx_shipment_lots_shipment" ON "shipment_lots"("shipment_id");
CREATE INDEX IF NOT EXISTS "idx_shipment_lots_lot" ON "shipment_lots"("lot_id");

-- RLS de shipment_lots: tenant via cadeia shipment → faction → tenant (mesmo padrão)
ALTER TABLE "shipment_lots" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shipment_lots_select" ON "shipment_lots";
CREATE POLICY "shipment_lots_select" ON "shipment_lots" FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM faction_shipments fs
    JOIN factions f ON f.id = fs.faction_id
    WHERE fs.id = shipment_lots.shipment_id AND f.tenant_id = auth_tenant_id()
  )
);
DROP POLICY IF EXISTS "shipment_lots_insert" ON "shipment_lots";
CREATE POLICY "shipment_lots_insert" ON "shipment_lots" FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM faction_shipments fs
    JOIN factions f ON f.id = fs.faction_id
    WHERE fs.id = shipment_id AND f.tenant_id = auth_tenant_id()
  )
);
DROP POLICY IF EXISTS "shipment_lots_delete" ON "shipment_lots";
CREATE POLICY "shipment_lots_delete" ON "shipment_lots" FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM faction_shipments fs
    JOIN factions f ON f.id = fs.faction_id
    WHERE fs.id = shipment_lots.shipment_id AND f.tenant_id = auth_tenant_id()
  )
);

-- ROLLBACK (manual):
--   DROP TABLE IF EXISTS "shipment_lots";
--   ALTER TABLE "faction_shipments" DROP COLUMN IF EXISTS "tenant_id",
--     DROP COLUMN IF EXISTS "total_quantity", DROP COLUMN IF EXISTS "expected_return";
--   (re-aplicar NOT NULL só se a tabela estiver vazia)

-- Devolução de remessas — modelo Híbrido A+B.
-- Fluxo: RECEIVED_BY_FACTION → (facção DECLARA no portal: ok/defeito/data →
-- gera código de devolução) → RETURN_DECLARED → (fábrica confere com o código +
-- contagem CEGA) → RETURNED (bateu) | PARTIALLY_RETURNED (faltou/divergiu).
--
-- Modelo: 1 remessa = 1 lote → tudo mora em faction_shipments (sem junção nova).
-- status É um enum Postgres "ShipmentStatus" (confirmado por sondagem) — não é
-- TEXT livre. Precisa do novo valor RETURN_DECLARED. Colunas novas: NULLABLE,
-- idempotentes. faction_estimated_return (DATE) já existe → reusada para a data
-- declarada (NÃO duplicar).

-- Novo estado no enum. ADD VALUE IF NOT EXISTS é idempotente (PG 12+).
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'RETURN_DECLARED';

ALTER TABLE "faction_shipments"
  -- Código de devolução (mesma mecânica do delivery_code)
  ADD COLUMN IF NOT EXISTS "return_code" VARCHAR(6),
  ADD COLUMN IF NOT EXISTS "return_code_expires_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "return_code_attempts" INTEGER NOT NULL DEFAULT 0,
  -- Declaração da facção (portal)
  ADD COLUMN IF NOT EXISTS "declared_ok" INTEGER,
  ADD COLUMN IF NOT EXISTS "declared_defect" INTEGER,
  ADD COLUMN IF NOT EXISTS "declared_at" TIMESTAMPTZ,
  -- Reconciliação da conferência (fábrica): OK | SHORTAGE | DISCREPANCY
  ADD COLUMN IF NOT EXISTS "reconciliation_status" VARCHAR(16),
  -- Faltante persistido = quantity_sent − (quantity_returned + quantity_defective)
  ADD COLUMN IF NOT EXISTS "shortage_qty" INTEGER;

-- A data estimada de devolução declarada reusa a coluna existente
-- "faction_estimated_return" (DATE) — nada a criar.

-- Índice para filtrar pendências de reconciliação rapidamente.
CREATE INDEX IF NOT EXISTS "idx_faction_shipments_reconciliation"
  ON "faction_shipments" ("reconciliation_status");

-- ROLLBACK (manual):
--   DROP INDEX IF EXISTS "idx_faction_shipments_reconciliation";
--   ALTER TABLE "faction_shipments"
--     DROP COLUMN IF EXISTS "return_code",
--     DROP COLUMN IF EXISTS "return_code_expires_at",
--     DROP COLUMN IF EXISTS "return_code_attempts",
--     DROP COLUMN IF EXISTS "declared_ok",
--     DROP COLUMN IF EXISTS "declared_defect",
--     DROP COLUMN IF EXISTS "declared_at",
--     DROP COLUMN IF EXISTS "reconciliation_status",
--     DROP COLUMN IF EXISTS "shortage_qty";

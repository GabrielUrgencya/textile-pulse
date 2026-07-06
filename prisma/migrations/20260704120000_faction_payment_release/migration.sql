-- Pagamentos de facção com liberação parcial.
-- Permite liberar o pagamento das peças boas e reter o das defeituosas até a
-- resolução do defeito. Tudo em faction_shipments (1 remessa = 1 lote).
-- Já existem: payment_value (bruto = boas×preço), deduction_value (defeito×preço).
-- Colunas novas: NULLABLE/defaults, idempotentes. payment_status é VARCHAR livre
-- (o app valida a string), NÃO é enum Postgres.

ALTER TABLE "faction_shipments"
  -- Valor efetivamente liberado para pagamento
  ADD COLUMN IF NOT EXISTS "released_value" DECIMAL(10, 2) NOT NULL DEFAULT 0,
  -- Valor retido (peças com defeito) até resolução
  ADD COLUMN IF NOT EXISTS "retained_value" DECIMAL(10, 2) NOT NULL DEFAULT 0,
  -- PENDING | PARTIALLY_RELEASED | RELEASED | PAID
  ADD COLUMN IF NOT EXISTS "payment_status" VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  -- Quando foi marcado como pago
  ADD COLUMN IF NOT EXISTS "paid_at" TIMESTAMPTZ,
  -- Trilha de ajustes/liberações (o revert-deduction já usa metadata; garante existência)
  ADD COLUMN IF NOT EXISTS "metadata" JSONB NOT NULL DEFAULT '{}';

-- Índice para filtrar pendências de pagamento (dashboards financeiros)
CREATE INDEX IF NOT EXISTS "idx_faction_shipments_payment_status"
  ON "faction_shipments" ("payment_status");

-- ROLLBACK (manual):
--   DROP INDEX IF EXISTS "idx_faction_shipments_payment_status";
--   ALTER TABLE "faction_shipments"
--     DROP COLUMN IF EXISTS "released_value",
--     DROP COLUMN IF EXISTS "retained_value",
--     DROP COLUMN IF EXISTS "payment_status",
--     DROP COLUMN IF EXISTS "paid_at";
--   (NÃO derrubar metadata no rollback — pode conter dados do revert-deduction)

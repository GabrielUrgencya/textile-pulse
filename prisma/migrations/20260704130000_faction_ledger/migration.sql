-- Ledger de compensação por facção.
-- Saldo corrente (factions.current_balance) mantido por trigger a cada entrada
-- append-only em faction_ledger. Crédito (+) quando pagamento é liberado; débito
-- (−) por dedução. Saldo negativo = "a compensar" na próxima remessa.
-- Idempotente.

-- 1) Coluna de saldo denormalizado
ALTER TABLE "factions"
  ADD COLUMN IF NOT EXISTS "current_balance" NUMERIC(12, 2) NOT NULL DEFAULT 0;

-- 2) Tabela de lançamentos (append-only)
CREATE TABLE IF NOT EXISTS "faction_ledger" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "faction_id" UUID NOT NULL,
  "shipment_id" UUID,
  "entry_type" VARCHAR(24) NOT NULL,   -- PAYMENT | DEDUCTION | ADJUSTMENT | COMPENSATION
  "amount" NUMERIC(12, 2) NOT NULL,    -- assinado: + crédito à facção, − débito
  "balance_after" NUMERIC(12, 2) NOT NULL,
  "description" TEXT,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "faction_ledger_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "faction_ledger_tenant_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "faction_ledger_faction_fkey" FOREIGN KEY ("faction_id")
    REFERENCES "factions"("id") ON DELETE CASCADE,
  CONSTRAINT "faction_ledger_shipment_fkey" FOREIGN KEY ("shipment_id")
    REFERENCES "faction_shipments"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "idx_faction_ledger_faction" ON "faction_ledger" ("faction_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_faction_ledger_tenant" ON "faction_ledger" ("tenant_id");

-- 3) Trigger de consistência: calcula balance_after e mantém factions.current_balance.
--    SECURITY DEFINER para o UPDATE em factions independente da RLS do chamador;
--    search_path fixo por segurança.
CREATE OR REPLACE FUNCTION "faction_ledger_apply"()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  current_bal NUMERIC(12,2);
BEGIN
  -- Bloqueia a linha da facção para evitar corrida no saldo.
  SELECT current_balance INTO current_bal
    FROM factions WHERE id = NEW.faction_id FOR UPDATE;
  IF current_bal IS NULL THEN
    current_bal := 0;
  END IF;

  NEW.balance_after := ROUND(current_bal + NEW.amount, 2);

  UPDATE factions
    SET current_balance = NEW.balance_after
    WHERE id = NEW.faction_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_faction_ledger_apply" ON "faction_ledger";
CREATE TRIGGER "trg_faction_ledger_apply"
  BEFORE INSERT ON "faction_ledger"
  FOR EACH ROW EXECUTE FUNCTION "faction_ledger_apply"();

-- 4) RLS tenant-scoped (via faction → tenant)
ALTER TABLE "faction_ledger" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "faction_ledger_select" ON "faction_ledger";
CREATE POLICY "faction_ledger_select" ON "faction_ledger" FOR SELECT USING (
  EXISTS (SELECT 1 FROM factions f WHERE f.id = faction_ledger.faction_id AND f.tenant_id = auth_tenant_id())
);
DROP POLICY IF EXISTS "faction_ledger_insert" ON "faction_ledger";
CREATE POLICY "faction_ledger_insert" ON "faction_ledger" FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM factions f WHERE f.id = faction_id AND f.tenant_id = auth_tenant_id())
);

-- ROLLBACK (manual):
--   DROP TRIGGER IF EXISTS "trg_faction_ledger_apply" ON "faction_ledger";
--   DROP FUNCTION IF EXISTS "faction_ledger_apply"();
--   DROP TABLE IF EXISTS "faction_ledger";
--   ALTER TABLE "factions" DROP COLUMN IF EXISTS "current_balance";

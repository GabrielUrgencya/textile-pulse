-- Metas acumulativas persistidas (épico Metas; endurecimento previsto na
-- Story 9.3 — o rollover.ts calcula on-the-fly só o DIÁRIO em janela de 30d).
-- goal_deficits persiste o fechamento de cada período (daily|weekly|monthly)
-- por usuário: déficit = MAX(0, meta_efetiva − produzido). Idempotente.

CREATE TABLE IF NOT EXISTS "goal_deficits" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "period_type" VARCHAR(8) NOT NULL,           -- 'daily' | 'weekly' | 'monthly'
  "period_reference" DATE NOT NULL,             -- início do período que GEROU o déficit
  "base_goal" INTEGER NOT NULL,
  "produced" INTEGER NOT NULL,
  "deficit" INTEGER NOT NULL,
  "carried_to" DATE,                            -- início do período que absorveu
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "goal_deficits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "goal_deficits_tenant_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "goal_deficits_user_fkey" FOREIGN KEY ("user_id")
    REFERENCES "profiles"("id") ON DELETE CASCADE,
  CONSTRAINT "goal_deficits_deficit_check" CHECK ("deficit" >= 0),
  -- Fechamento idempotente: job pode rodar N vezes sem duplicar.
  CONSTRAINT "goal_deficits_unique" UNIQUE ("user_id", "period_type", "period_reference")
);

CREATE INDEX IF NOT EXISTS "idx_goal_deficits_user"
  ON "goal_deficits" ("user_id", "period_type", "period_reference" DESC);
CREATE INDEX IF NOT EXISTS "idx_goal_deficits_tenant"
  ON "goal_deficits" ("tenant_id", "period_type");

ALTER TABLE "goal_deficits" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "goal_deficits_select" ON "goal_deficits";
CREATE POLICY "goal_deficits_select" ON "goal_deficits" FOR SELECT
  USING ("tenant_id" = auth_tenant_id());
DROP POLICY IF EXISTS "goal_deficits_insert" ON "goal_deficits";
CREATE POLICY "goal_deficits_insert" ON "goal_deficits" FOR INSERT
  WITH CHECK ("tenant_id" = auth_tenant_id());
DROP POLICY IF EXISTS "goal_deficits_update" ON "goal_deficits";
CREATE POLICY "goal_deficits_update" ON "goal_deficits" FOR UPDATE
  USING ("tenant_id" = auth_tenant_id());

-- ROLLBACK (manual):
--   DROP TABLE IF EXISTS "goal_deficits";

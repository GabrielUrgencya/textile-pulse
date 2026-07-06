-- Notificações estratégicas (Frente 2 do épico Portal da Facção).
-- Estende a tabela notifications existente:
--   entity_type/entity_id → clique abre o contexto (remessa/financeiro/devolução)
--   dedupe_key            → cron pode rodar N vezes sem duplicar (UNIQUE parcial)
--   audience              → separa destinatário ADMIN × FACTION (hoje o portal
--                           filtra só tenant_id e vaza notificações do admin)
-- Idempotente.

ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "entity_type" VARCHAR(24),
  ADD COLUMN IF NOT EXISTS "entity_id" UUID,
  ADD COLUMN IF NOT EXISTS "dedupe_key" TEXT,
  ADD COLUMN IF NOT EXISTS "audience" VARCHAR(12) NOT NULL DEFAULT 'ADMIN';

-- Dedupe determinístico para disparos agendados (INSERT ... ON CONFLICT DO NOTHING)
CREATE UNIQUE INDEX IF NOT EXISTS "idx_notifications_dedupe"
  ON "notifications" ("dedupe_key") WHERE "dedupe_key" IS NOT NULL;

-- Badge de não lidas do portal (faction_id + audience + read_at)
CREATE INDEX IF NOT EXISTS "idx_notifications_faction_audience"
  ON "notifications" ("faction_id", "audience", "read_at");

-- Backfill: notificações existentes com faction_id são as que o portal já
-- exibia (ex.: DEFECT_DETECTED) → marcá-las como FACTION preserva o comportamento.
UPDATE "notifications" SET "audience" = 'FACTION' WHERE "faction_id" IS NOT NULL;

-- ROLLBACK (manual):
--   DROP INDEX IF EXISTS "idx_notifications_dedupe";
--   DROP INDEX IF EXISTS "idx_notifications_faction_audience";
--   ALTER TABLE "notifications"
--     DROP COLUMN IF EXISTS "entity_type",
--     DROP COLUMN IF EXISTS "entity_id",
--     DROP COLUMN IF EXISTS "dedupe_key",
--     DROP COLUMN IF EXISTS "audience";

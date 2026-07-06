-- Chat bilateral admin ↔ facção (Frente 3 do épico Portal da Facção).
-- Tabela única já preparada para todas as mídias (text/audio/image/video/file);
-- Fase A usa só text. Idempotente.

CREATE TABLE IF NOT EXISTS "faction_messages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "faction_id" UUID NOT NULL,
  "sender_type" VARCHAR(12) NOT NULL,              -- 'ADMIN' | 'FACTION'
  "sender_id" UUID,                                 -- profile id (admin); null p/ facção
  "content_type" VARCHAR(12) NOT NULL DEFAULT 'text', -- text|audio|image|video|file
  "content_text" TEXT,
  "content_url" TEXT,                               -- mídia (fases B/C)
  "content_meta" JSONB,                             -- duração/size/filename etc.
  "read_at" TIMESTAMPTZ,                            -- lido pelo lado RECEPTOR
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "faction_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "faction_messages_tenant_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "faction_messages_faction_fkey" FOREIGN KEY ("faction_id")
    REFERENCES "factions"("id") ON DELETE CASCADE,
  -- Mensagem nunca vazia: precisa de texto OU mídia.
  CONSTRAINT "faction_messages_content_check"
    CHECK ("content_text" IS NOT NULL OR "content_url" IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS "idx_faction_messages_history"
  ON "faction_messages" ("faction_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_faction_messages_unread"
  ON "faction_messages" ("faction_id", "sender_type", "read_at");
CREATE INDEX IF NOT EXISTS "idx_faction_messages_tenant"
  ON "faction_messages" ("tenant_id", "created_at" DESC);

-- RLS tenant-scoped (padrão do projeto). Portal escreve via service role.
ALTER TABLE "faction_messages" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "faction_messages_select" ON "faction_messages";
CREATE POLICY "faction_messages_select" ON "faction_messages" FOR SELECT USING (
  EXISTS (SELECT 1 FROM factions f WHERE f.id = faction_messages.faction_id AND f.tenant_id = auth_tenant_id())
);
DROP POLICY IF EXISTS "faction_messages_insert" ON "faction_messages";
CREATE POLICY "faction_messages_insert" ON "faction_messages" FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM factions f WHERE f.id = faction_id AND f.tenant_id = auth_tenant_id())
);
DROP POLICY IF EXISTS "faction_messages_update" ON "faction_messages";
CREATE POLICY "faction_messages_update" ON "faction_messages" FOR UPDATE USING (
  EXISTS (SELECT 1 FROM factions f WHERE f.id = faction_messages.faction_id AND f.tenant_id = auth_tenant_id())
);

-- ROLLBACK (manual):
--   DROP TABLE IF EXISTS "faction_messages";

-- Story "Metas acumulativas por SETOR".
-- Estende goal_deficits (hoje só por usuário) para guardar TAMBÉM o fechamento
-- por SETOR (stage). Aditivo e retrocompatível: as linhas existentes recebem
-- scope='USER' pelo DEFAULT; nenhum dado histórico de setor é semeado ("começa zerado").
--
-- NOTA DE DESIGN (evita regressão do cron): NÃO usamos índice único PARCIAL.
-- O upsert do PostgREST usa ON CONFLICT (colunas) e NÃO casa com índice parcial —
-- isso quebraria o upsert de usuário existente. Em vez disso, um UNIQUE normal
-- (tenant_id, stage_id, period_type, period_reference) resolve a idempotência do
-- setor sem tocar no unique de usuário: linhas de usuário têm stage_id NULL
-- (distinto no unique) e linhas de setor têm user_id NULL (distinto no unique de usuário).

-- 1) Colunas novas (idempotente)
ALTER TABLE "goal_deficits"
  ADD COLUMN IF NOT EXISTS "stage_id" UUID,
  ADD COLUMN IF NOT EXISTS "scope" VARCHAR(8) NOT NULL DEFAULT 'USER';

-- 2) user_id passa a ser opcional (linhas de setor têm user_id NULL)
ALTER TABLE "goal_deficits" ALTER COLUMN "user_id" DROP NOT NULL;

-- 3) FK do setor + CHECK de consistência de escopo + UNIQUE de setor (guardados)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goal_deficits_stage_fkey') THEN
    ALTER TABLE "goal_deficits"
      ADD CONSTRAINT "goal_deficits_stage_fkey" FOREIGN KEY ("stage_id")
      REFERENCES "stages"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goal_deficits_scope_check') THEN
    ALTER TABLE "goal_deficits"
      ADD CONSTRAINT "goal_deficits_scope_check" CHECK (
        ("scope" = 'USER'   AND "user_id" IS NOT NULL AND "stage_id" IS NULL) OR
        ("scope" = 'SECTOR' AND "stage_id" IS NOT NULL AND "user_id" IS NULL)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goal_deficits_sector_unique') THEN
    ALTER TABLE "goal_deficits"
      ADD CONSTRAINT "goal_deficits_sector_unique"
      UNIQUE ("tenant_id", "stage_id", "period_type", "period_reference");
  END IF;
END $$;

-- 4) Índice de leitura para a TV do setor (déficit vigente por stage)
CREATE INDEX IF NOT EXISTS "idx_goal_deficits_sector"
  ON "goal_deficits" ("stage_id", "period_type", "period_reference" DESC)
  WHERE "scope" = 'SECTOR';

-- RLS: as políticas existentes usam tenant_id = auth_tenant_id() e continuam válidas
-- para linhas de setor (têm tenant_id). O cron escreve via service_role (bypassa RLS).

-- ROLLBACK (manual):
--   DROP INDEX IF EXISTS "idx_goal_deficits_sector";
--   ALTER TABLE "goal_deficits" DROP CONSTRAINT IF EXISTS "goal_deficits_sector_unique";
--   ALTER TABLE "goal_deficits" DROP CONSTRAINT IF EXISTS "goal_deficits_scope_check";
--   ALTER TABLE "goal_deficits" DROP CONSTRAINT IF EXISTS "goal_deficits_stage_fkey";
--   DELETE FROM "goal_deficits" WHERE "scope" = 'SECTOR';   -- se houver linhas de setor
--   ALTER TABLE "goal_deficits" ALTER COLUMN "user_id" SET NOT NULL;
--   ALTER TABLE "goal_deficits" DROP COLUMN IF EXISTS "scope";
--   ALTER TABLE "goal_deficits" DROP COLUMN IF EXISTS "stage_id";

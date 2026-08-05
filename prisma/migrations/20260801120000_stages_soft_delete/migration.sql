-- Frente 1: excluir etapa não funcionava (RLS de stages não tem policy de DELETE →
-- o delete apagava 0 linhas SEM erro e a tela mentia "removida"; além disso um
-- hard-delete destruiria histórico via CASCADE de targets/achievements/config).
--
-- Solução: SOFT-DELETE. A etapa é DESATIVADA (is_active=false), preservando todo o
-- histórico vinculado (scan_events, defect_records, metas, config). O caminho de
-- escrita é UPDATE (que TEM policy de RLS), não DELETE.
ALTER TABLE "stages"
  ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;

-- Índice do filtro dominante: "etapas ativas do tenant".
CREATE INDEX IF NOT EXISTS "idx_stages_active"
  ON "stages" ("tenant_id") WHERE "is_active" = true;

COMMENT ON COLUMN "stages"."is_active" IS
  'Soft-delete de etapa. false = desativada (sai da lista ativa/TV/scan; histórico preservado).';

-- ROLLBACK (manual):
--   DROP INDEX IF EXISTS "idx_stages_active";
--   ALTER TABLE "stages" DROP COLUMN IF EXISTS "is_active";

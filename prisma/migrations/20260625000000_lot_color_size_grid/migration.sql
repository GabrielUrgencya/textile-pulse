-- Story 8.25 — Grade cor×tamanho no lote + divisão manual de lotes
-- Adiciona estrutura de COR e GRADE DE TAMANHOS ao lote, base para a OP por grade
-- e o fracionamento manual (substitui a divisão automática rígida 200→4×50).
--
-- 100% ADITIVA e RETROCOMPATÍVEL:
--   - Colunas nullable; lotes legados (color/size_grid = NULL) seguem válidos.
--   - `destination` (rótulo livre) é PRESERVADO para compatibilidade.
--   - `quantity` continua sendo a fonte de verdade da contagem (= soma da grade).

-- ============================================================
-- Lot: color + size_grid
-- ============================================================
ALTER TABLE "public"."lots"
  ADD COLUMN IF NOT EXISTS "color"     TEXT,
  ADD COLUMN IF NOT EXISTS "size_grid" JSONB;

-- Índice para consultas por cor (ex.: "fazer 2 cores do 1004", plano diário)
CREATE INDEX IF NOT EXISTS "idx_lots_color" ON "public"."lots"("color");

COMMENT ON COLUMN "public"."lots"."color"     IS 'Cor do lote na grade cor×tamanho (Story 8.25). Null em lotes legados.';
COMMENT ON COLUMN "public"."lots"."size_grid" IS 'Grade de tamanhos estruturada {"P":10,"M":20,...}. quantity = soma da grade.';

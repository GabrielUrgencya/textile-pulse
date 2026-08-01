-- Frentes 1-3 (fluxo de facção fracionado) — migração NÃO destrutiva.
--
-- Nenhuma coluna existente é alterada e nenhum dado é tocado: a liserie, em
-- produção, continua exatamente com o comportamento atual (colunas novas nascem
-- nulas = "individual"; o novo status só existe para quem optar por ele).

-- 1) FRENTE 1 — Agrupamento de remessas.
--    Remessas de um mesmo envio compartilham shipment_group_id. NULL = remessa
--    individual (comportamento atual; todas as remessas legadas permanecem NULL).
--    O modelo canônico "1 remessa = 1 lote" NÃO muda — o grupo é uma camada de
--    apresentação/acesso por cima (o portal agrupa; o financeiro segue por lote).
ALTER TABLE "faction_shipments"
  ADD COLUMN IF NOT EXISTS "shipment_group_id" UUID;

-- Leitura dominante: "traga as remessas deste grupo". Índice parcial — só as
-- agrupadas entram, não infla o índice com as milhares de remessas individuais.
CREATE INDEX IF NOT EXISTS "idx_faction_shipments_group"
  ON "faction_shipments" ("shipment_group_id")
  WHERE "shipment_group_id" IS NOT NULL;

COMMENT ON COLUMN "faction_shipments"."shipment_group_id" IS
  'Frente 1: remessas do mesmo envio compartilham este id (e o delivery/return code). NULL = remessa individual (comportamento legado).';

-- 2) FRENTE 3 — Estado intermediário de conferência.
--    Recebido → AGUARDANDO CONFERÊNCIA → (confere ao longo de dias) → Conferido.
--    Coexiste com a conferência cega imediata: é OPCIONAL, escolhido no
--    recebimento. Adicionar valor a enum é aditivo e irreversível — por isso
--    IF NOT EXISTS (idempotente) e nunca removemos valores do enum.
--
--    NOTA: ALTER TYPE ... ADD VALUE deve ser aplicado FORA de um bloco de
--    transação que também USE o valor. Esta migração apenas adiciona — o primeiro
--    uso ocorre em requisições futuras, então é seguro.
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'AWAITING_INSPECTION';

-- FRENTE 2 — Preço por remessa: NÃO precisa de coluna nova.
--   faction_shipments.payment_value já existe e passa a ser gravado na criação
--   da remessa (preço × quantidade). O cadastro (factions.price_per_piece)
--   permanece como sugestão/fallback. Nada a migrar aqui.

-- ROLLBACK (manual):
--   DROP INDEX IF EXISTS "idx_faction_shipments_group";
--   ALTER TABLE "faction_shipments" DROP COLUMN IF EXISTS "shipment_group_id";
--   -- Observação: não há DROP VALUE em enums no Postgres. Para reverter
--   -- 'AWAITING_INSPECTION' seria necessário recriar o tipo — evitar em produção.

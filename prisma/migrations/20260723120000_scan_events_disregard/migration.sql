-- Story "Zerar progresso do operador" (ADR meta-por-hora-e-zerar-progresso).
--
-- Zerar o progresso NÃO apaga a bipagem: scan_events é a rastreabilidade do lote.
-- Apagar a linha tiraria a prova de por onde a peça passou e poderia deixar o
-- lote com estágio atual inconsistente. Em vez disso, marcamos a bipagem como
-- DESCONSIDERADA — o motor de métricas a ignora, o histórico do lote a mantém.
--
-- NOTA DE SEGURANÇA (motivo da função SECURITY DEFINER):
-- A policy scan_events_update valida APENAS o tenant (sem WITH CHECK e sem
-- filtro de papel). Qualquer usuário autenticado do tenant — inclusive um
-- OPERADOR — consegue dar UPDATE em qualquer scan_event. Enquanto não havia
-- coluna sensível isso era inócuo; com disregarded_at passaria a ser o caminho
-- para um operador apagar a própria produção ruim. Por isso:
--   1) UPDATE das duas colunas novas é REVOGADO de `authenticated`;
--   2) a marcação só acontece pela função abaixo, que valida ADMIN + tenant.
-- A policy ampla em si é dívida PRÉ-EXISTENTE e NÃO é alterada aqui (alterá-la
-- mexeria no comportamento de liserie, que está em produção).

-- 1) Colunas de desconsideração (idempotente)
ALTER TABLE "scan_events"
  ADD COLUMN IF NOT EXISTS "disregarded_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "disregarded_by" UUID;

COMMENT ON COLUMN "scan_events"."disregarded_at" IS
  'NULL = bipagem conta nas métricas. Preenchido = zerada por um admin; sai de toda métrica, permanece no histórico do lote.';
COMMENT ON COLUMN "scan_events"."disregarded_by" IS
  'Admin que zerou o progresso (profiles.id). Ver audit_log para o registro completo.';

-- 2) FK do autor da desconsideração
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scan_events_disregarded_by_fkey') THEN
    ALTER TABLE "scan_events"
      ADD CONSTRAINT "scan_events_disregarded_by_fkey" FOREIGN KEY ("disregarded_by")
      REFERENCES "profiles"("id") ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;

  -- Consistência: ou as duas colunas estão preenchidas, ou nenhuma.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scan_events_disregard_check') THEN
    ALTER TABLE "scan_events"
      ADD CONSTRAINT "scan_events_disregard_check" CHECK (
        ("disregarded_at" IS NULL AND "disregarded_by" IS NULL) OR
        ("disregarded_at" IS NOT NULL AND "disregarded_by" IS NOT NULL)
      );
  END IF;
END $$;

-- 3) Índice da leitura dominante do motor de métricas (user + stage + janela),
--    já excluindo as desconsideradas. Predicado só com IS NULL de propósito:
--    evita depender da imutabilidade de literais do enum ScanEventType.
CREATE INDEX IF NOT EXISTS "idx_scan_events_metric"
  ON "scan_events" ("user_id", "stage_id", "event_type", "scanned_at" DESC)
  WHERE "disregarded_at" IS NULL;

-- 4) Blindagem: a sessão do usuário deixa de poder dar UPDATE em scan_events.
--
--    ATENÇÃO — por que a tabela inteira e não só as colunas novas: o Postgres
--    NÃO permite subtrair uma coluna de um GRANT feito no nível da tabela.
--    Como já existe GRANT UPDATE ON scan_events TO authenticated, um
--    REVOKE por coluna é silenciosamente inócuo (verificado em dry-run).
--
--    É seguro revogar tudo: NENHUM ponto da aplicação faz UPDATE/UPSERT/DELETE
--    em scan_events — os 16 arquivos que tocam a tabela fazem INSERT (só
--    /api/scan) e SELECT. A escrita de disregarded_* passa pela função abaixo,
--    que roda como owner e não depende deste privilégio.
--
--    Efeito colateral positivo: fecha a dívida pré-existente da policy
--    scan_events_update, que permitia a QUALQUER usuário do tenant — inclusive
--    OPERADOR — alterar qualquer bipagem. A policy é mantida como está (não
--    mexemos em lógica de liserie); sem o privilégio, ela deixa de ser porta.
REVOKE UPDATE ON "scan_events" FROM authenticated;
REVOKE UPDATE ON "scan_events" FROM anon;

-- 5) Única porta de entrada da zeração: valida ADMIN + mesmo tenant do alvo,
--    marca APENAS as bipagens produtivas (STAGE_OUT) do dia informado e devolve
--    quantas foram marcadas — o número que a confirmação da UI já mostrou.
--    Idempotente: rodar de novo não marca nada (filtro disregarded_at IS NULL).
CREATE OR REPLACE FUNCTION "reset_user_day_progress"(
  "p_target_user" UUID,
  "p_day"         DATE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant     UUID;
  v_caller     UUID := auth.uid();
  v_role       TEXT;
  v_target_ten UUID;
  v_count      INTEGER;
  v_from       TIMESTAMPTZ;
  v_to         TIMESTAMPTZ;
BEGIN
  v_tenant := auth_tenant_id();
  IF v_tenant IS NULL OR v_caller IS NULL THEN
    RAISE EXCEPTION 'nao autenticado';
  END IF;

  -- Gate de papel: só ADMIN zera progresso (o app já checa settings:manage;
  -- esta é a segunda camada, que vale mesmo se chamarem a RPC direto).
  SELECT role INTO v_role FROM profiles WHERE id = v_caller;
  IF v_role IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'apenas ADMIN pode zerar progresso';
  END IF;

  -- Gate de tenant: o alvo tem de ser da mesma fábrica.
  SELECT tenant_id INTO v_target_ten FROM profiles WHERE id = p_target_user;
  IF v_target_ten IS NULL OR v_target_ten <> v_tenant THEN
    RAISE EXCEPTION 'usuario alvo fora do tenant';
  END IF;

  -- Janela do dia no fuso do tenant (-03), não em UTC.
  v_from := (p_day::TEXT || ' 00:00:00-03')::TIMESTAMPTZ;
  v_to   := v_from + INTERVAL '1 day';

  UPDATE scan_events se
     SET disregarded_at = NOW(),
         disregarded_by = v_caller
   WHERE se.user_id        = p_target_user
     AND se.event_type     = 'STAGE_OUT'
     AND se.scanned_at    >= v_from
     AND se.scanned_at     < v_to
     AND se.disregarded_at IS NULL
     -- Cinto e suspensório: confina ao tenant também pelo caminho do lote.
     AND EXISTS (
       SELECT 1 FROM lots l
         JOIN production_orders po ON po.id = l.po_id
        WHERE l.id = se.lot_id AND po.tenant_id = v_tenant
     );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

COMMENT ON FUNCTION "reset_user_day_progress"(UUID, DATE) IS
  'Zera o progresso do dia de um operador marcando as bipagens STAGE_OUT como desconsideradas. Só ADMIN, só dentro do próprio tenant. Retorna quantas foram marcadas. Registrar em audit_log do lado da API.';

REVOKE ALL ON FUNCTION "reset_user_day_progress"(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION "reset_user_day_progress"(UUID, DATE) TO authenticated;

-- ROLLBACK (manual):
--   DROP FUNCTION IF EXISTS "reset_user_day_progress"(UUID, DATE);
--   DROP INDEX IF EXISTS "idx_scan_events_metric";
--   ALTER TABLE "scan_events" DROP CONSTRAINT IF EXISTS "scan_events_disregard_check";
--   ALTER TABLE "scan_events" DROP CONSTRAINT IF EXISTS "scan_events_disregarded_by_fkey";
--   ALTER TABLE "scan_events" DROP COLUMN IF EXISTS "disregarded_by";
--   ALTER TABLE "scan_events" DROP COLUMN IF EXISTS "disregarded_at";
--   GRANT UPDATE ON "scan_events" TO authenticated;  -- restaura o privilégio amplo
--   GRANT UPDATE ON "scan_events" TO anon;

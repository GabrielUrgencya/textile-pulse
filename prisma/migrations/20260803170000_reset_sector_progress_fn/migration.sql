-- Frente 1 — Zerar meta do setor na TV (progresso por período)
-- Função SECURITY DEFINER que desconsidera as bipagens STAGE_OUT de um SETOR
-- dentro de uma janela [p_from, p_to) arbitrária (hora/dia/semana/mês).
-- Espelha reset_user_day_progress, trocando o alvo user_id por stage_id e o
-- dia fixo por uma janela livre. Mesmos gates: ADMIN + tenant (revalidados no
-- banco, pois a sessão do app NÃO tem UPDATE em scan_events).
-- Não apaga bipagem: marca disregarded_at/by — some das métricas, permanece no
-- histórico do lote (rastreabilidade preservada). NÃO toca goal_deficits.
CREATE OR REPLACE FUNCTION public.reset_sector_progress(p_stage uuid, p_from timestamptz, p_to timestamptz)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant    UUID;
  v_caller    UUID := auth.uid();
  v_role      TEXT;
  v_stage_ten UUID;
  v_count     INTEGER;
BEGIN
  v_tenant := auth_tenant_id();
  IF v_tenant IS NULL OR v_caller IS NULL THEN
    RAISE EXCEPTION 'nao autenticado';
  END IF;

  -- Gate de papel: só ADMIN zera progresso (2ª camada, vale mesmo chamando a RPC direto).
  SELECT role INTO v_role FROM profiles WHERE id = v_caller;
  IF v_role IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'apenas ADMIN pode zerar progresso';
  END IF;

  -- Gate de tenant: o setor tem de ser da mesma fábrica.
  SELECT tenant_id INTO v_stage_ten FROM stages WHERE id = p_stage;
  IF v_stage_ten IS NULL OR v_stage_ten <> v_tenant THEN
    RAISE EXCEPTION 'setor fora do tenant';
  END IF;

  IF p_to <= p_from THEN
    RAISE EXCEPTION 'janela invalida';
  END IF;

  UPDATE scan_events se
     SET disregarded_at = NOW(),
         disregarded_by = v_caller
   WHERE se.stage_id      = p_stage
     AND se.event_type    = 'STAGE_OUT'
     AND se.scanned_at   >= p_from
     AND se.scanned_at    < p_to
     AND se.disregarded_at IS NULL
     -- Cinto e suspensório: confina ao tenant também pelo caminho do lote.
     AND EXISTS (
       SELECT 1 FROM lots l
         JOIN production_orders po ON po.id = l.po_id
        WHERE l.id = se.lot_id AND po.tenant_id = v_tenant
     );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $function$;

-- LISION Vendas — solicitações do cliente (2026-09-08):
--   (F3) Excluir período em aberto (destrava criação de novo período).
--   (F2/F4) Ranking individual com NOMES no kiosk da TV (aditivo, sem tocar no snapshot).

-- ── F3: excluir período em ABERTO ────────────────────────────────────────────
-- Só OPEN. Venda no período trava pela FK (sales → period ON DELETE RESTRICT);
-- capturamos e devolvemos erro amigável. Atribuições caem em CASCADE.
CREATE OR REPLACE FUNCTION public.sales_admin_delete_period_v1(p_period_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE v_tenant uuid := public.auth_tenant_id(); v_actor uuid := auth.uid(); v_period public.sales_periods%ROWTYPE;
BEGIN
  IF v_tenant IS NULL OR v_actor IS NULL OR NOT public.sales_is_admin() THEN
    RAISE EXCEPTION 'sales_admin_required' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant::text || ':sales-periods', 0));
  SELECT * INTO v_period FROM public.sales_periods WHERE tenant_id = v_tenant AND id = p_period_id FOR UPDATE;
  IF v_period.id IS NULL THEN RAISE EXCEPTION 'sales_not_found_or_out_of_scope' USING ERRCODE = 'P0002'; END IF;
  IF v_period.status <> 'OPEN' THEN RAISE EXCEPTION 'sales_closed_period_or_not_found' USING ERRCODE = '25006'; END IF;
  IF EXISTS (SELECT 1 FROM public.sales s WHERE s.tenant_id = v_tenant AND s.period_id = p_period_id) THEN
    RAISE EXCEPTION 'sales_period_has_sales' USING ERRCODE = '23503';
  END IF;
  DELETE FROM public.sales_periods WHERE tenant_id = v_tenant AND id = p_period_id;  -- atribuições: CASCADE
  INSERT INTO public.sales_audit_events (tenant_id, actor_id, action, entity_type, entity_id, details)
  VALUES (v_tenant, v_actor, 'SALES_PERIOD_DELETED', 'sales_period', p_period_id, jsonb_build_object('before', to_jsonb(v_period)));
  RETURN jsonb_build_object('id', p_period_id, 'deleted', true);
EXCEPTION WHEN foreign_key_violation THEN
  RAISE EXCEPTION 'sales_period_has_sales' USING ERRCODE = '23503';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sales_admin_delete_period_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_admin_delete_period_v1(uuid) TO authenticated;

-- ── F2/F4: ranking individual (com nomes) para o kiosk da TV ──────────────────
-- Aditivo: a TV segue lendo o snapshot coletivo e passa a ler TAMBÉM este ranking.
-- Exposto por token (mesmo padrão do snapshot) e SÓ quando o admin liga
-- "Agregados da equipe" (allow_team_aggregates) — controle de privacidade existente.
CREATE OR REPLACE FUNCTION public.sales_tv_kiosk_ranking_v2(p_token text, p_period_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, extensions
AS $$
DECLARE v_tenant uuid; v_period uuid; v_start date; v_end date; v_allow boolean; v_rows jsonb;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' OR (p_period_key IS NOT NULL AND p_period_key !~ '^[0-9a-f]{64}$') THEN
    RETURN jsonb_build_object('available', false);
  END IF;
  SELECT c.tenant_id INTO v_tenant FROM public.sales_tv_kiosk_credentials c
    WHERE c.token_hash = extensions.digest(convert_to(p_token, 'UTF8'), 'sha256')
      AND c.scope = 'sales_tv' AND c.revoked_at IS NULL AND c.expires_at > now();
  IF v_tenant IS NULL THEN RETURN jsonb_build_object('available', false); END IF;

  SELECT COALESCE(allow_team_aggregates, false) INTO v_allow FROM public.sales_config WHERE tenant_id = v_tenant;
  IF NOT COALESCE(v_allow, false) THEN RETURN jsonb_build_object('available', true, 'allowed', false, 'consultants', '[]'::jsonb); END IF;

  SELECT sp.id, sp.starts_on, sp.ends_on INTO v_period, v_start, v_end FROM public.sales_periods sp
    WHERE sp.tenant_id = v_tenant AND (p_period_key IS NULL OR public.sales_collective_period_key_v1(v_tenant, sp.id) = p_period_key)
    ORDER BY (sp.status = 'OPEN') DESC, sp.starts_on DESC LIMIT 1;
  IF v_period IS NULL THEN RETURN jsonb_build_object('available', true, 'allowed', true, 'consultants', '[]'::jsonb); END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'profile_id', x.profile_id, 'name', x.full_name, 'realized', x.realized,
    'target', x.target, 'percent', CASE WHEN x.target > 0 THEN round(x.realized / x.target * 100, 1) ELSE 0 END,
    'position', x.position
  ) ORDER BY x.position, x.full_name, x.profile_id), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT q.*, rank() OVER (ORDER BY q.realized DESC, q.full_name, q.profile_id) AS position
    FROM (
      SELECT p.id AS profile_id, p.full_name,
        COALESCE(sum(s.sale_value - s.discount_value) FILTER (WHERE s.status = 'CLOSED'), 0) AS realized,
        COALESCE((SELECT max(sga.target_value_snapshot) FROM public.sales_goal_assignments sga
                  WHERE sga.tenant_id = v_tenant AND sga.period_id = v_period AND sga.profile_id = p.id
                    AND sga.is_active AND sga.goal_scope_snapshot = 'INDIVIDUAL'), 0) AS target
      FROM public.sales_memberships sm
      JOIN public.profiles p ON p.tenant_id = sm.tenant_id AND p.id = sm.profile_id
      LEFT JOIN public.sales s ON s.tenant_id = sm.tenant_id AND s.consultant_profile_id = sm.profile_id AND s.period_id = v_period
      WHERE sm.tenant_id = v_tenant AND sm.role = 'CONSULTANT' AND sm.is_active
      GROUP BY p.id, p.full_name
    ) q
  ) x;

  RETURN jsonb_build_object('available', true, 'allowed', true, 'period', jsonb_build_object('starts_on', v_start, 'ends_on', v_end), 'consultants', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.sales_tv_kiosk_ranking_v2(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_tv_kiosk_ranking_v2(text, text) TO service_role;

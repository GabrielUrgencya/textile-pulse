-- LISION Vendas — P4 (parte segura): abertura automática do período do mês corrente.
--
-- Toggle por tenant (sales_config.auto_open_period). Quando ligado e NÃO houver período
-- aberto, cria o período do mês corrente. NUNCA reabre um período encerrado e NUNCA
-- fecha nada (o fechamento continua manual/deliberado). Idempotente + advisory lock.

ALTER TABLE public.sales_config
  ADD COLUMN IF NOT EXISTS auto_open_period boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.sales_ensure_open_period_v1()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant uuid := public.auth_tenant_id();
  v_auto boolean; v_tz text; v_today date; v_ms date; v_me date; v_pid uuid;
BEGIN
  IF v_tenant IS NULL OR auth.uid() IS NULL OR NOT public.sales_is_admin() THEN
    RAISE EXCEPTION 'sales_admin_required' USING ERRCODE = '42501';
  END IF;

  -- Já há período aberto? Retorna-o (nada a fazer).
  SELECT id INTO v_pid FROM public.sales_periods
  WHERE tenant_id = v_tenant AND status = 'OPEN' ORDER BY starts_on DESC LIMIT 1;
  IF v_pid IS NOT NULL THEN
    RETURN jsonb_build_object('period_id', v_pid, 'created', false, 'reason', 'already_open');
  END IF;

  SELECT auto_open_period, COALESCE(timezone, 'America/Sao_Paulo')
  INTO v_auto, v_tz FROM public.sales_config WHERE tenant_id = v_tenant;
  IF NOT COALESCE(v_auto, false) THEN
    RETURN jsonb_build_object('period_id', NULL, 'created', false, 'reason', 'auto_disabled');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant::text || ':sales-ensure-period', 0));
  v_today := (now() AT TIME ZONE COALESCE(v_tz, 'America/Sao_Paulo'))::date;
  v_ms := date_trunc('month', v_today)::date;
  v_me := (date_trunc('month', v_today) + interval '1 month - 1 day')::date;

  -- O mês corrente já existe (em qualquer status)? Não recria nem reabre.
  IF EXISTS (SELECT 1 FROM public.sales_periods WHERE tenant_id = v_tenant AND starts_on = v_ms AND ends_on = v_me) THEN
    SELECT id INTO v_pid FROM public.sales_periods
    WHERE tenant_id = v_tenant AND starts_on = v_ms AND ends_on = v_me AND status = 'OPEN';
    RETURN jsonb_build_object('period_id', v_pid, 'created', false, 'reason', 'month_exists');
  END IF;

  INSERT INTO public.sales_periods (tenant_id, starts_on, ends_on, status)
  VALUES (v_tenant, v_ms, v_me, 'OPEN')
  ON CONFLICT (tenant_id, starts_on, ends_on) DO NOTHING
  RETURNING id INTO v_pid;
  IF v_pid IS NULL THEN
    SELECT id INTO v_pid FROM public.sales_periods
    WHERE tenant_id = v_tenant AND starts_on = v_ms AND ends_on = v_me;
  END IF;

  INSERT INTO public.sales_audit_events (tenant_id, actor_id, action, entity_type, entity_id, details)
  VALUES (v_tenant, auth.uid(), 'SALES_PERIOD_AUTO_OPENED', 'sales_period', v_pid,
    jsonb_build_object('starts_on', v_ms, 'ends_on', v_me));

  RETURN jsonb_build_object('period_id', v_pid, 'created', true, 'reason', 'created_current_month');
END;
$$;

-- Toggle liga/desliga da abertura automática (admin-only).
CREATE OR REPLACE FUNCTION public.sales_admin_set_auto_open_period_v1(p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE v_tenant uuid := public.auth_tenant_id();
BEGIN
  IF v_tenant IS NULL OR auth.uid() IS NULL OR NOT public.sales_is_admin() THEN
    RAISE EXCEPTION 'sales_admin_required' USING ERRCODE = '42501';
  END IF;
  IF p_enabled IS NULL THEN RAISE EXCEPTION 'sales_config_validation' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.sales_config (tenant_id, pieces_per_set, timezone, week_starts_on, allow_team_aggregates, auto_open_period, revision)
  VALUES (v_tenant, 2, 'America/Sao_Paulo', 1, false, p_enabled, 1)
  ON CONFLICT (tenant_id) DO UPDATE SET auto_open_period = EXCLUDED.auto_open_period, updated_at = now();
  RETURN jsonb_build_object('auto_open_period', p_enabled);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sales_ensure_open_period_v1() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sales_admin_set_auto_open_period_v1(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_ensure_open_period_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_admin_set_auto_open_period_v1(boolean) TO authenticated;

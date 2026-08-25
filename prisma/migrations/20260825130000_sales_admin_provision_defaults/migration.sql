-- LISION Vendas — provisionamento self-service das metas/configuração padrão.
--
-- Contexto: hoje um tenant só passa a ter metas depois de rodar o script
-- scripts/provision-sales-tenant.mjs (operador + manifesto). Clientes novos ficam
-- com a tela de Metas vazia ("Nenhuma meta configurada") sem ter o que editar.
-- Esta RPC dá o mesmo resultado por um clique na própria interface: um ADM de
-- Vendas inicializa, para o SEU tenant, config + métodos + período aberto do mês
-- + as 6 metas canônicas + atribuições no período aberto.
--
-- Segurança:
--   - SECURITY DEFINER com guarda de tenant/admin (auth_tenant_id + sales_is_admin),
--     igual às demais RPCs de Vendas. REVOKE de PUBLIC/anon; GRANT a authenticated.
--   - Opera SEMPRE no tenant do chamador — nunca aceita tenant do cliente.
--   - Idempotente: tudo é ON CONFLICT DO NOTHING / WHERE NOT EXISTS. Reexecutar não
--     duplica nada; só preenche o que faltar. Advisory lock por tenant evita corrida.
--   - Não toca em vendas/fechamentos/celebrações (histórico imutável).

CREATE OR REPLACE FUNCTION public.sales_admin_provision_defaults_v1()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant uuid := public.auth_tenant_id();
  v_actor  uuid := auth.uid();
  v_tz text;
  v_today date;
  v_month_start date;
  v_month_end date;
  v_period_id uuid;
  v_period_open boolean := false;
  v_period_created boolean := false;
  v_config_created int := 0;
  v_methods_created int := 0;
  v_goals_created int := 0;
  v_assignments_created int := 0;
  v_n int;
BEGIN
  IF v_tenant IS NULL OR v_actor IS NULL OR NOT public.sales_is_admin() THEN
    RAISE EXCEPTION 'sales_admin_required' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant::text || ':sales-provision', 0));

  -- 1) Configuração canônica (só cria se ausente; nunca sobrescreve a existente).
  INSERT INTO public.sales_config (tenant_id, pieces_per_set, timezone, week_starts_on, allow_team_aggregates, revision)
  VALUES (v_tenant, 2, 'America/Sao_Paulo', 1, false, 1)
  ON CONFLICT (tenant_id) DO NOTHING;
  GET DIAGNOSTICS v_config_created = ROW_COUNT;

  SELECT COALESCE(sc.timezone, 'America/Sao_Paulo') INTO v_tz
  FROM public.sales_config sc WHERE sc.tenant_id = v_tenant;
  v_tz := COALESCE(v_tz, 'America/Sao_Paulo');
  v_today := (now() AT TIME ZONE v_tz)::date;

  -- 2) Métodos de pagamento padrão (só se o tenant não tiver NENHUM método).
  IF NOT EXISTS (SELECT 1 FROM public.sales_payment_methods WHERE tenant_id = v_tenant) THEN
    INSERT INTO public.sales_payment_methods (tenant_id, name, sort_order, is_active)
    VALUES (v_tenant, 'PIX', 1, true),
           (v_tenant, 'Cartão de crédito', 2, true),
           (v_tenant, 'Dinheiro', 3, true)
    ON CONFLICT (tenant_id, name) DO NOTHING;
    GET DIAGNOSTICS v_methods_created = ROW_COUNT;
  END IF;

  -- 3) Período aberto: reutiliza um OPEN existente; se não houver, cria o do mês corrente.
  SELECT id INTO v_period_id
  FROM public.sales_periods
  WHERE tenant_id = v_tenant AND status = 'OPEN'
  ORDER BY starts_on DESC LIMIT 1;

  IF v_period_id IS NULL THEN
    v_month_start := date_trunc('month', v_today)::date;
    v_month_end := (date_trunc('month', v_today) + interval '1 month - 1 day')::date;
    INSERT INTO public.sales_periods (tenant_id, starts_on, ends_on, status)
    VALUES (v_tenant, v_month_start, v_month_end, 'OPEN')
    ON CONFLICT (tenant_id, starts_on, ends_on) DO NOTHING
    RETURNING id INTO v_period_id;
    IF v_period_id IS NULL THEN
      -- Já existia um período com essas datas (possivelmente encerrado): reusa só se OPEN.
      SELECT id INTO v_period_id FROM public.sales_periods
      WHERE tenant_id = v_tenant AND starts_on = v_month_start AND ends_on = v_month_end AND status = 'OPEN';
    ELSE
      v_period_created := true;
    END IF;
  END IF;

  v_period_open := v_period_id IS NOT NULL;

  -- 4) As 6 metas canônicas (identidade imutável por provisioning_key). Valores são
  --    padrões editáveis — o cliente ajusta na tela de Metas depois.
  INSERT INTO public.sales_goals
    (tenant_id, provisioning_key, name, scope, target_value, commission_percent, sort_order, is_challenge, is_active, revision)
  SELECT v_tenant, g.key, g.gname, g.gscope::public."SalesGoalScope",
         g.target, g.commission, g.sort_order, g.is_challenge, true, 1
  FROM (VALUES
    ('META_1',     'Meta 1',     'INDIVIDUAL',  15000, 2, 1, false),
    ('META_2',     'Meta 2',     'INDIVIDUAL',  25000, 3, 2, false),
    ('META_3',     'Meta 3',     'INDIVIDUAL',  40000, 4, 3, false),
    ('CHALLENGE',  'Desafio',    'INDIVIDUAL',  60000, 5, 4, true),
    ('QUARTERLY',  'Trimestral', 'QUARTERLY',  120000, 0, 5, false),
    ('COLLECTIVE', 'Coletiva',   'COLLECTIVE', 200000, 0, 6, false)
  ) AS g(key, gname, gscope, target, commission, sort_order, is_challenge)
  ON CONFLICT (tenant_id, provisioning_key) WHERE provisioning_key IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS v_goals_created = ROW_COUNT;

  -- 5) Atribuições no período aberto (idempotentes). Snapshots congelam a meta.
  IF v_period_open THEN
    -- INDIVIDUAIS: uma por consultora ativa.
    INSERT INTO public.sales_goal_assignments
      (tenant_id, goal_id, period_id, profile_id, target_value_snapshot, commission_percent_snapshot,
       goal_name_snapshot, goal_scope_snapshot, goal_sort_order_snapshot, goal_is_challenge_snapshot,
       valid_from_snapshot, valid_until_snapshot, goal_revision, is_active, revision)
    SELECT g.tenant_id, g.id, v_period_id, sm.profile_id, g.target_value, g.commission_percent,
           g.name, g.scope, g.sort_order, g.is_challenge, g.valid_from, g.valid_until, g.revision, true, 1
    FROM public.sales_goals g
    JOIN public.sales_memberships sm
      ON sm.tenant_id = g.tenant_id AND sm.role = 'CONSULTANT' AND sm.is_active
    WHERE g.tenant_id = v_tenant AND g.is_active AND g.scope = 'INDIVIDUAL' AND g.provisioning_key IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.sales_goal_assignments a
        WHERE a.tenant_id = g.tenant_id AND a.goal_id = g.id AND a.period_id = v_period_id AND a.profile_id = sm.profile_id
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_assignments_created := v_assignments_created + v_n;

    -- COLETIVAS/TRIMESTRAIS: uma atribuição sem consultora (profile_id NULL).
    INSERT INTO public.sales_goal_assignments
      (tenant_id, goal_id, period_id, profile_id, target_value_snapshot, commission_percent_snapshot,
       goal_name_snapshot, goal_scope_snapshot, goal_sort_order_snapshot, goal_is_challenge_snapshot,
       valid_from_snapshot, valid_until_snapshot, goal_revision, is_active, revision)
    SELECT g.tenant_id, g.id, v_period_id, NULL, g.target_value, g.commission_percent,
           g.name, g.scope, g.sort_order, g.is_challenge, g.valid_from, g.valid_until, g.revision, true, 1
    FROM public.sales_goals g
    WHERE g.tenant_id = v_tenant AND g.is_active AND g.scope IN ('COLLECTIVE', 'QUARTERLY') AND g.provisioning_key IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.sales_goal_assignments a
        WHERE a.tenant_id = g.tenant_id AND a.goal_id = g.id AND a.period_id = v_period_id AND a.profile_id IS NULL
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_assignments_created := v_assignments_created + v_n;
  END IF;

  INSERT INTO public.sales_audit_events (tenant_id, actor_id, action, entity_type, entity_id, details)
  VALUES (v_tenant, v_actor, 'SALES_DEFAULTS_PROVISIONED', 'sales_tenant', v_tenant,
    jsonb_build_object(
      'config_created', v_config_created > 0,
      'methods_created', v_methods_created,
      'period_created', v_period_created,
      'goals_created', v_goals_created,
      'assignments_created', v_assignments_created
    ));

  RETURN jsonb_build_object(
    'config_created', v_config_created > 0,
    'methods_created', v_methods_created,
    'period_id', v_period_id,
    'period_created', v_period_created,
    'goals_created', v_goals_created,
    'assignments_created', v_assignments_created
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sales_admin_provision_defaults_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_admin_provision_defaults_v1() TO authenticated;

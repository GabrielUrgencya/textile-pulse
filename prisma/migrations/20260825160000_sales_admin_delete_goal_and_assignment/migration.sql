-- LISION Vendas — exclusão de metas e atribuições (editabilidade total).
--
-- Contexto: hoje metas/atribuições podem ser criadas e editadas, mas não excluídas.
-- Estas RPCs adicionam exclusão definitiva com proteção de histórico:
--   - Excluir META: bloqueada se houver atribuição em período ENCERRADO (passado
--     imutável). Caso contrário, exclui (a FK goal_id ON DELETE CASCADE limpa as
--     atribuições de período aberto). Pode-se recriar as 6 padrão pelo provisionador.
--   - Excluir ATRIBUIÇÃO: apenas em período ABERTO (encerrado é histórico).
--
-- Segurança: SECURITY DEFINER com guarda de tenant/admin, igual às demais RPCs.
-- REVOKE de PUBLIC/anon; GRANT a authenticated. Advisory lock por tenant. Auditoria.

CREATE OR REPLACE FUNCTION public.sales_admin_delete_goal_v1(p_goal_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE v_tenant uuid := public.auth_tenant_id(); v_actor uuid := auth.uid(); v_before jsonb;
BEGIN
  IF v_tenant IS NULL OR v_actor IS NULL OR NOT public.sales_is_admin() THEN
    RAISE EXCEPTION 'sales_admin_required' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant::text || ':sales-goals', 0));

  SELECT to_jsonb(sg) INTO v_before FROM public.sales_goals sg
  WHERE sg.tenant_id = v_tenant AND sg.id = p_goal_id FOR UPDATE;
  IF v_before IS NULL THEN RAISE EXCEPTION 'sales_not_found_or_out_of_scope' USING ERRCODE = 'P0002'; END IF;

  -- Proteção de histórico: recusa se a meta tiver atribuição em período ENCERRADO.
  IF EXISTS (
    SELECT 1 FROM public.sales_goal_assignments a
    JOIN public.sales_periods p ON p.tenant_id = a.tenant_id AND p.id = a.period_id
    WHERE a.tenant_id = v_tenant AND a.goal_id = p_goal_id AND p.status = 'CLOSED'
  ) THEN
    RAISE EXCEPTION 'sales_goal_has_history' USING ERRCODE = '23514';
  END IF;

  -- CASCADE (FK goal_id) remove as atribuições de períodos abertos junto.
  DELETE FROM public.sales_goals WHERE tenant_id = v_tenant AND id = p_goal_id;

  INSERT INTO public.sales_audit_events (tenant_id, actor_id, action, entity_type, entity_id, details)
  VALUES (v_tenant, v_actor, 'SALES_GOAL_DELETED', 'sales_goal', p_goal_id, jsonb_build_object('before', v_before));

  RETURN jsonb_build_object('id', p_goal_id, 'deleted', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_admin_delete_goal_assignment_v1(p_assignment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE v_tenant uuid := public.auth_tenant_id(); v_actor uuid := auth.uid();
        v_before jsonb; v_period uuid; v_status public."SalesPeriodStatus";
BEGIN
  IF v_tenant IS NULL OR v_actor IS NULL OR NOT public.sales_is_admin() THEN
    RAISE EXCEPTION 'sales_admin_required' USING ERRCODE = '42501';
  END IF;

  SELECT to_jsonb(a), a.period_id INTO v_before, v_period
  FROM public.sales_goal_assignments a
  WHERE a.tenant_id = v_tenant AND a.id = p_assignment_id FOR UPDATE;
  IF v_before IS NULL THEN RAISE EXCEPTION 'sales_not_found_or_out_of_scope' USING ERRCODE = 'P0002'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant::text || ':sales-assignments:' || v_period::text, 0));

  SELECT status INTO v_status FROM public.sales_periods WHERE tenant_id = v_tenant AND id = v_period;
  IF v_status IS DISTINCT FROM 'OPEN' THEN
    RAISE EXCEPTION 'sales_closed_period_or_not_found' USING ERRCODE = '25006';
  END IF;

  DELETE FROM public.sales_goal_assignments WHERE tenant_id = v_tenant AND id = p_assignment_id;

  INSERT INTO public.sales_audit_events (tenant_id, actor_id, action, entity_type, entity_id, details)
  VALUES (v_tenant, v_actor, 'SALES_GOAL_ASSIGNMENT_DELETED', 'sales_goal_assignment', p_assignment_id, jsonb_build_object('before', v_before));

  RETURN jsonb_build_object('id', p_assignment_id, 'deleted', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sales_admin_delete_goal_v1(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sales_admin_delete_goal_assignment_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_admin_delete_goal_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_admin_delete_goal_assignment_v1(uuid) TO authenticated;

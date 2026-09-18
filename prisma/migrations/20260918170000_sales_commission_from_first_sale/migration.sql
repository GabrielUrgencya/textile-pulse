-- Comissão contabilizada DESDE A PRIMEIRA VENDA (sem exigir atingir meta) + correção do agregado do admin.
--
-- Regra anterior (sales_metrics_internal_v1):
--   * Individual: só entrava a faixa cujo alvo já fora batido (target_value_snapshot <= realizado).
--     Se nenhuma faixa fosse batida => comissão 0. => vendedora via R$0 mesmo tendo vendas.
--   * Agregado (admin, p_profile_id IS NULL): a comissão NUNCA era calculada => "Comissão acumulada" R$0,00.
--
-- Regra nova:
--   * Individual: aplica o % da faixa atingida; se nenhuma foi atingida mas há vendas, aplica o % da
--     MENOR faixa (piso) desde a primeira venda. Progressivo: sobe conforme cruza as metas.
--   * Agregado: soma a comissão de cada consultora (realizado individual x % aplicável dela).
--   * commission_value passa a ser calculado (v_commission_value) e usado no retorno.
--
-- Sem alteração de schema. Apenas CREATE OR REPLACE da função interna (as demais chamam esta).

CREATE OR REPLACE FUNCTION public.sales_metrics_internal_v1(p_tenant_id uuid,p_period_id uuid,p_profile_id uuid DEFAULT NULL,p_as_of date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE v_start date;v_end date;v_status public."SalesPeriodStatus";v_tz text;v_today date;v_real numeric:=0;v_count bigint:=0;v_pieces bigint:=0;v_freight numeric:=0;v_discount numeric:=0;v_total_days int:=0;v_elapsed int:=0;v_remaining int:=0;v_collective numeric:=0;v_commission numeric:=0;v_commission_value numeric:=0;v_goals jsonb:='[]';
BEGIN
 IF p_tenant_id IS NULL OR p_period_id IS NULL THEN RAISE EXCEPTION 'sales_metrics_scope_required' USING ERRCODE='22023';END IF;
 SELECT sp.starts_on,sp.ends_on,sp.status,COALESCE(sc.timezone,'America/Sao_Paulo') INTO v_start,v_end,v_status,v_tz FROM public.sales_periods sp LEFT JOIN public.sales_config sc ON sc.tenant_id=sp.tenant_id WHERE sp.tenant_id=p_tenant_id AND sp.id=p_period_id;
 IF v_start IS NULL THEN RAISE EXCEPTION 'sales_period_not_found' USING ERRCODE='P0002';END IF; v_today:=COALESCE(p_as_of,(now() AT TIME ZONE v_tz)::date);
 SELECT COALESCE(sum(s.sale_value-s.discount_value),0),count(*),COALESCE(sum(s.pieces_total),0),COALESCE(sum(s.freight_value),0),COALESCE(sum(s.discount_value),0) INTO v_real,v_count,v_pieces,v_freight,v_discount FROM public.sales s WHERE s.tenant_id=p_tenant_id AND s.period_id=p_period_id AND s.status='CLOSED' AND (p_profile_id IS NULL OR s.consultant_profile_id=p_profile_id);
 SELECT count(*)::int,count(*) FILTER(WHERE v_status='CLOSED' OR d<=LEAST(v_today,v_end))::int,count(*) FILTER(WHERE v_status='OPEN' AND d>=GREATEST(v_today,v_start))::int INTO v_total_days,v_elapsed,v_remaining FROM(SELECT x::date d FROM generate_series(v_start,v_end,interval '1 day')x WHERE extract(isodow FROM x) BETWEEN 1 AND 5 AND NOT EXISTS(SELECT 1 FROM public.sales_holidays sh WHERE sh.tenant_id=p_tenant_id AND sh.date=x::date AND sh.is_active))q;
 SELECT COALESCE(max(sga.target_value_snapshot),0) INTO v_collective FROM public.sales_goal_assignments sga WHERE sga.tenant_id=p_tenant_id AND sga.period_id=p_period_id AND sga.profile_id IS NULL AND sga.is_active AND sga.goal_scope_snapshot='COLLECTIVE' AND (sga.valid_from_snapshot IS NULL OR sga.valid_from_snapshot<=v_end) AND (sga.valid_until_snapshot IS NULL OR sga.valid_until_snapshot>=v_start);
 IF p_profile_id IS NOT NULL THEN
   -- % da faixa atingida; se nenhuma, o % da MENOR faixa (piso), aplicado desde a primeira venda.
   SELECT COALESCE(
     (SELECT sga.commission_percent_snapshot FROM public.sales_goal_assignments sga
        WHERE sga.tenant_id=p_tenant_id AND sga.period_id=p_period_id AND sga.profile_id=p_profile_id AND sga.is_active AND sga.goal_scope_snapshot='INDIVIDUAL'
          AND sga.target_value_snapshot<=v_real
          AND (sga.valid_from_snapshot IS NULL OR sga.valid_from_snapshot<=v_end) AND (sga.valid_until_snapshot IS NULL OR sga.valid_until_snapshot>=v_start)
        ORDER BY sga.target_value_snapshot DESC,sga.goal_sort_order_snapshot DESC,sga.goal_id LIMIT 1),
     (SELECT sga.commission_percent_snapshot FROM public.sales_goal_assignments sga
        WHERE sga.tenant_id=p_tenant_id AND sga.period_id=p_period_id AND sga.profile_id=p_profile_id AND sga.is_active AND sga.goal_scope_snapshot='INDIVIDUAL'
          AND (sga.valid_from_snapshot IS NULL OR sga.valid_from_snapshot<=v_end) AND (sga.valid_until_snapshot IS NULL OR sga.valid_until_snapshot>=v_start)
        ORDER BY sga.target_value_snapshot ASC,sga.goal_sort_order_snapshot ASC,sga.goal_id LIMIT 1),
     0) INTO v_commission;
   v_commission_value:=round(v_real*v_commission/100,2);
 ELSE
   -- Agregado (admin): soma a comissão de cada consultora (realizado x % aplicável dela, desde a 1a venda).
   SELECT COALESCE(sum(round(t.rreal*t.pct/100,2)),0) INTO v_commission_value FROM (
     SELECT cc.rreal, COALESCE(
       (SELECT g.commission_percent_snapshot FROM public.sales_goal_assignments g
          WHERE g.tenant_id=p_tenant_id AND g.period_id=p_period_id AND g.profile_id=cc.id AND g.is_active AND g.goal_scope_snapshot='INDIVIDUAL'
            AND g.target_value_snapshot<=cc.rreal
            AND (g.valid_from_snapshot IS NULL OR g.valid_from_snapshot<=v_end) AND (g.valid_until_snapshot IS NULL OR g.valid_until_snapshot>=v_start)
          ORDER BY g.target_value_snapshot DESC,g.goal_sort_order_snapshot DESC,g.goal_id LIMIT 1),
       (SELECT g.commission_percent_snapshot FROM public.sales_goal_assignments g
          WHERE g.tenant_id=p_tenant_id AND g.period_id=p_period_id AND g.profile_id=cc.id AND g.is_active AND g.goal_scope_snapshot='INDIVIDUAL'
            AND (g.valid_from_snapshot IS NULL OR g.valid_from_snapshot<=v_end) AND (g.valid_until_snapshot IS NULL OR g.valid_until_snapshot>=v_start)
          ORDER BY g.target_value_snapshot ASC,g.goal_sort_order_snapshot ASC,g.goal_id LIMIT 1),
       0) pct
     FROM (
       SELECT p.id, COALESCE(sum(s.sale_value-s.discount_value) FILTER(WHERE s.status='CLOSED'),0) rreal
       FROM public.sales_memberships sm JOIN public.profiles p ON p.id=sm.profile_id AND p.tenant_id=sm.tenant_id
       LEFT JOIN public.sales s ON s.tenant_id=p_tenant_id AND s.period_id=p_period_id AND s.consultant_profile_id=p.id
       WHERE sm.tenant_id=p_tenant_id AND sm.role='CONSULTANT' AND sm.is_active
       GROUP BY p.id
     ) cc
   ) t;
   v_commission:=CASE WHEN v_real=0 THEN 0 ELSE round(v_commission_value/v_real*100,2) END;
 END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('goal_id',sga.goal_id,'name',sga.goal_name_snapshot,'scope',sga.goal_scope_snapshot,'target_value',sga.target_value_snapshot,'progress_percent',CASE WHEN sga.target_value_snapshot=0 THEN 0 ELSE round(v_real/sga.target_value_snapshot*100,2) END,'ideal_pace_percent',CASE WHEN v_total_days=0 THEN 0 ELSE round(v_elapsed::numeric/v_total_days*100,2) END,'required_per_business_day',CASE WHEN v_real>=sga.target_value_snapshot THEN 0 WHEN v_remaining=0 THEN NULL ELSE round((sga.target_value_snapshot-v_real)/v_remaining,2) END,'commission_percent',sga.commission_percent_snapshot,'is_challenge',sga.goal_is_challenge_snapshot,'sort_order',sga.goal_sort_order_snapshot) ORDER BY sga.goal_sort_order_snapshot,sga.target_value_snapshot,sga.goal_id),'[]') INTO v_goals FROM public.sales_goal_assignments sga WHERE sga.tenant_id=p_tenant_id AND sga.period_id=p_period_id AND sga.profile_id IS NOT DISTINCT FROM p_profile_id AND sga.is_active AND (sga.valid_from_snapshot IS NULL OR sga.valid_from_snapshot<=v_end) AND (sga.valid_until_snapshot IS NULL OR sga.valid_until_snapshot>=v_start);
 RETURN jsonb_build_object('period_id',p_period_id,'profile_id',p_profile_id,'as_of',v_today,'period_status',v_status,'realized_value',v_real,'sales_count',v_count,'pieces_total',v_pieces,'freight_total',v_freight,'discount_total',v_discount,'business_days_total',v_total_days,'business_days_elapsed',v_elapsed,'business_days_remaining',v_remaining,'ideal_pace_percent',CASE WHEN v_total_days=0 THEN 0 ELSE round(v_elapsed::numeric/v_total_days*100,2) END,'collective_target_value',v_collective,'collective_percent',CASE WHEN v_collective=0 THEN 0 ELSE round(v_real/v_collective*100,2) END,'contribution_percent',CASE WHEN p_profile_id IS NULL OR v_collective=0 THEN NULL ELSE round(v_real/v_collective*100,2) END,'commission_percent',v_commission,'commission_value',v_commission_value,'goals',v_goals);
END;
$$;

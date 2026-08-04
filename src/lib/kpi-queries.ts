import { SupabaseClient } from "@supabase/supabase-js";
import { localDayStart, localDayEnd } from "@/lib/tz";

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}

export interface KpiResult {
  /** "Foi pro estoque" — peças que ENTRARAM NO ESTOQUE no período (throughput final, Story 8.19). */
  produced_today: number;
  /** "Produzido hoje" — Σ produção ponderada de TODOS os setores (STAGE_OUT, dedupe por lote/etapa,
   *  CANCELLED fora). Sobe assim que qualquer setor bipa a saída de um lote (Correção E2E). */
  produced_today_sectors: number;
  defect_rate: number;
  active_ops: number;
  lots_by_stage: Array<{ stage_name: string; stage_id: string; count: number }>;
  top_producers: Array<{ user_id: string; full_name: string; scan_count: number }>;
  total_lots: number;
  total_scans: number;
  /** When weighted meta is enabled, this holds the weighted points value */
  weighted_points?: number;
  /** Whether weighted meta is active for this result */
  use_weighted_meta?: boolean;
  /** Story 8.18: tempo médio por etapa (pares STAGE_IN→STAGE_OUT) */
  avg_stage_durations?: Array<{
    stage_id: string;
    stage_name: string;
    avg_hours: number;
    samples: number;
  }>;
}

export interface ChartDataPoint {
  period: string;
  scans: number;
  defects: number;
}

export interface ComputeKpisOptions extends DateRange {
  /** Enable weighted meta calculation using meta_coefficient */
  useWeightedMeta?: boolean;
  /** Tenant do usuário — escopa o lookup da etapa ESTOQUE (nome repete entre tenants). */
  tenantId?: string;
}

/**
 * Compute production KPIs using server-side aggregation (RPCs).
 * RPCs perform GROUP BY in PostgreSQL — no full-table-scans.
 *
 * When useWeightedMeta is true, produced_today is replaced by
 * SUM(quantity_scanned * COALESCE(meta_coefficient, 1.0)) — "weighted points".
 */
export async function computeKpis(
  supabase: SupabaseClient,
  dateRange: DateRange | ComputeKpisOptions
): Promise<KpiResult> {
  const { from, to } = dateRange;
  const useWeightedMeta = "useWeightedMeta" in dateRange ? dateRange.useWeightedMeta : false;
  const tenantId = "tenantId" in dateRange ? dateRange.tenantId : undefined;
  // Story 8.29: limites do dia LOCAL (fuso do tenant), não UTC.
  const toEnd = localDayEnd(to);
  const fromStart = localDayStart(from);

  // Run all queries in parallel — 3 lightweight COUNTs + 2 RPCs + 1 COUNT
  const [
    scansResult,
    defectsResult,
    activeOpsResult,
    lotsByStageResult,
    topProducersResult,
    totalLotsResult,
    avgStageDurationResult,
  ] = await Promise.all([
    // Total scans in date range — Story 8.18: só STAGE_IN conta produção
    supabase
      .from("scan_events")
      .select("id", { count: "exact", head: true }).is("disregarded_at", null)
      .eq("event_type", "STAGE_IN")
      .gte("scanned_at", fromStart)
      .lte("scanned_at", toEnd),

    // Defect count in date range (HEAD count — no rows transferred)
    supabase
      .from("defect_records")
      .select("id", { count: "exact", head: true })
      .gte("detected_at", fromStart)
      .lte("detected_at", toEnd),

    // Active OPs count (HEAD count — no rows transferred)
    supabase
      .from("production_orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),

    // RPC: lots grouped by stage (aggregated in DB — returns ~5-10 rows)
    supabase.rpc("dashboard_lots_by_stage"),

    // RPC: top producers (aggregated in DB — returns max 10 rows)
    supabase.rpc("dashboard_top_producers", {
      from_date: fromStart,
      to_date: toEnd,
    }),

    // Total lots (HEAD count — no rows transferred)
    supabase
      .from("lots")
      .select("id", { count: "exact", head: true }),

    // Story 8.18: tempo médio por etapa (pares IN→OUT, agregado no banco)
    supabase.rpc("dashboard_avg_stage_duration", {
      from_date: fromStart,
      to_date: toEnd,
    }),
  ]);

  // Map RPC results (already aggregated — no client-side processing needed)
  const lotsByStage = (lotsByStageResult.data || []).map(
    (row: { stage_name: string; stage_id: string; count: number }) => ({
      stage_name: row.stage_name,
      stage_id: row.stage_id,
      count: Number(row.count),
    })
  );

  const topProducers = (topProducersResult.data || []).map(
    (row: { user_id: string; full_name: string; scan_count: number }) => ({
      user_id: row.user_id,
      full_name: row.full_name,
      scan_count: Number(row.scan_count),
    })
  );

  const totalScans = scansResult.count ?? 0;
  const totalDefects = defectsResult.count ?? 0;
  const defectRate = totalScans > 0 ? (totalDefects / totalScans) * 100 : 0;

  // Story 8.18: tempo médio por etapa
  const avgStageDurations = (
    (avgStageDurationResult.data as Array<{
      stage_id: string;
      stage_name: string;
      avg_hours: number | string;
      samples: number | string;
    }> | null) || []
  ).map((row) => ({
    stage_id: row.stage_id,
    stage_name: row.stage_name,
    avg_hours: Number(row.avg_hours) || 0,
    samples: Number(row.samples) || 0,
  }));

  // Story 8.19: produção por PEÇA = peças dos lotes que ENTRARAM NO ESTOQUE no período.
  // Conta cada lote uma única vez (na entrada do estoque), não por bipagem/etapa.
  // Escopo de tenant: "ESTOQUE" existe em cada tenant — sem o filtro, estoqueIds
  // pegaria a etapa de todos os tenants e a produção somaria dados de outro tenant.
  let estoqueQuery = supabase.from("stages").select("id").eq("name", "ESTOQUE");
  if (tenantId) estoqueQuery = estoqueQuery.eq("tenant_id", tenantId);
  const { data: estoqueStages } = await estoqueQuery;
  const estoqueIds = (estoqueStages || []).map((s) => s.id as string);

  let producedPieces = 0;
  let weightedPieces = 0;
  if (estoqueIds.length > 0) {
    const { data: stockScans } = await supabase
      .from("scan_events")
      .select(`
        lot_id,
        lots!inner (
          quantity,
          production_orders!inner ( meta_coefficient, status )
        )
      `).is("disregarded_at", null)
      .eq("event_type", "STAGE_OUT")
      .neq("lots.production_orders.status", "CANCELLED")
      .in("stage_id", estoqueIds)
      .gte("scanned_at", fromStart)
      .lte("scanned_at", toEnd);

    const seenLots = new Set<string>();
    for (const scan of stockScans || []) {
      const lotId = scan.lot_id as string;
      if (seenLots.has(lotId)) continue; // lote entra no estoque uma vez
      seenLots.add(lotId);
      const lotRel = scan.lots as unknown;
      const lot = (Array.isArray(lotRel) ? lotRel[0] : lotRel) as {
        quantity: number | string | null;
        production_orders: { meta_coefficient: string | number | null } | { meta_coefficient: string | number | null }[];
      } | null;
      const qty = Number(lot?.quantity) || 0;
      const poRel = lot?.production_orders;
      const po = (Array.isArray(poRel) ? poRel[0] : poRel) as { meta_coefficient: string | number | null } | null;
      const coeff = Number(po?.meta_coefficient) || 1.0;
      producedPieces += qty;
      weightedPieces += qty * coeff;
    }
    weightedPieces = Math.round(weightedPieces * 10) / 10;
  }

  const weightedPoints: number | undefined = useWeightedMeta ? weightedPieces : undefined;
  const producedToday = useWeightedMeta ? weightedPieces : producedPieces;

  // Correção E2E — "Produzido hoje" = Σ produção ponderada de TODOS os setores.
  // STAGE_OUT ponderado por reference_stage_targets, dedupe por lote POR etapa,
  // CANCELLED fora, escopado por tenant. Distinto de produced_today (throughput ESTOQUE):
  // este sobe assim que qualquer setor bipa a saída de um lote.
  let producedTodaySectors = 0;
  {
    const { data: rst } = await supabase
      .from("reference_stage_targets")
      .select("stage_id, reference, coefficient");
    const coeffMap = new Map<string, number>();
    for (const c of rst || []) coeffMap.set(`${c.stage_id}|${c.reference}`, Number(c.coefficient) || 1);

    let outQ = supabase
      .from("scan_events")
      .select("lot_id, stage_id, lots!inner(quantity, production_orders!inner(reference, status, tenant_id))").is("disregarded_at", null)
      .eq("event_type", "STAGE_OUT")
      .neq("lots.production_orders.status", "CANCELLED")
      .gte("scanned_at", fromStart)
      .lte("scanned_at", toEnd);
    if (tenantId) outQ = outQ.eq("lots.production_orders.tenant_id", tenantId);
    const { data: outScans } = await outQ;

    const seenSectorLots = new Set<string>();
    for (const r of (outScans || []) as Array<{ lot_id: string; stage_id: string | null; lots: unknown }>) {
      const key = `${r.stage_id}|${r.lot_id}`;
      if (seenSectorLots.has(key)) continue; // dedupe por (etapa, lote)
      seenSectorLots.add(key);
      const lot = (Array.isArray(r.lots) ? r.lots[0] : r.lots) as {
        quantity: number | string | null;
        production_orders: { reference: string | null } | { reference: string | null }[];
      } | null;
      const qty = Number(lot?.quantity) || 0;
      const poRel = lot?.production_orders;
      const po = (Array.isArray(poRel) ? poRel[0] : poRel) as { reference: string | null } | null;
      const coeff = coeffMap.get(`${r.stage_id}|${po?.reference ?? ""}`) ?? 1;
      producedTodaySectors += qty * coeff;
    }
    producedTodaySectors = Math.round(producedTodaySectors * 10) / 10;
  }

  return {
    produced_today: producedToday,
    produced_today_sectors: producedTodaySectors,
    defect_rate: Math.round(defectRate * 100) / 100,
    active_ops: activeOpsResult.count ?? 0,
    lots_by_stage: lotsByStage,
    top_producers: topProducers,
    total_lots: totalLotsResult.count ?? 0,
    total_scans: totalScans,
    weighted_points: weightedPoints,
    use_weighted_meta: useWeightedMeta,
    avg_stage_durations: avgStageDurations,
  };
}

/**
 * Compute production chart data using server-side aggregation (RPC).
 * RPC performs GROUP BY hour/day in PostgreSQL — no full-table-scans.
 */
export async function computeChartData(
  supabase: SupabaseClient,
  dateRange: DateRange,
  groupBy: "hour" | "day" = "day"
): Promise<ChartDataPoint[]> {
  const { from, to } = dateRange;
  // O dashboard recebe datas locais do tenant. Converter os limites para
  // instantes absolutos evita perder eventos noturnos que já caem no dia
  // seguinte em UTC (por exemplo, 23:30 BRT = 02:30 UTC).
  const fromStart = localDayStart(from);
  const toEnd = localDayEnd(to);

  // RPC: chart data aggregated in DB — returns ~10-30 rows max
  const { data, error } = await supabase.rpc("dashboard_chart_data", {
    from_date: fromStart,
    to_date: toEnd,
    group_by: groupBy,
  });

  if (error || !data) {
    return [];
  }

  return (data as Array<{ period: string; scans: number; defects: number }>).map(
    (row) => ({
      period: row.period,
      scans: Number(row.scans),
      defects: Number(row.defects),
    })
  );
}

import { SupabaseClient } from "@supabase/supabase-js";

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}

export interface KpiResult {
  produced_today: number;
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
}

export interface ChartDataPoint {
  period: string;
  scans: number;
  defects: number;
}

export interface ComputeKpisOptions extends DateRange {
  /** Enable weighted meta calculation using meta_coefficient */
  useWeightedMeta?: boolean;
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
  const toEnd = `${to}T23:59:59.999Z`;
  const fromStart = `${from}T00:00:00.000Z`;

  // Run all queries in parallel — 3 lightweight COUNTs + 2 RPCs + 1 COUNT
  const [
    scansResult,
    defectsResult,
    activeOpsResult,
    lotsByStageResult,
    topProducersResult,
    totalLotsResult,
  ] = await Promise.all([
    // Total scans in date range (HEAD count — no rows transferred)
    supabase
      .from("scan_events")
      .select("id", { count: "exact", head: true })
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

  // Weighted meta calculation: SUM(quantity_scanned * COALESCE(meta_coefficient, 1.0))
  let weightedPoints: number | undefined;
  if (useWeightedMeta) {
    const { data: weightedData } = await supabase
      .from("scan_events")
      .select(`
        quantity_scanned,
        lots!inner (
          production_orders!inner ( meta_coefficient )
        )
      `)
      .gte("scanned_at", fromStart)
      .lte("scanned_at", toEnd);

    if (weightedData && weightedData.length > 0) {
      weightedPoints = 0;
      for (const scan of weightedData) {
        const qty = (scan.quantity_scanned as number) || 1;
        const lotRel = scan.lots as unknown;
        const lot = (Array.isArray(lotRel) ? lotRel[0] : lotRel) as {
          production_orders: { meta_coefficient: string | number | null } | { meta_coefficient: string | number | null }[];
        } | null;
        const poRel = lot?.production_orders;
        const po = (Array.isArray(poRel) ? poRel[0] : poRel) as { meta_coefficient: string | number | null } | null;
        const coeff = Number(po?.meta_coefficient) || 1.0;
        weightedPoints += qty * coeff;
      }
      weightedPoints = Math.round(weightedPoints * 10) / 10;
    } else {
      weightedPoints = 0;
    }
  }

  return {
    produced_today: useWeightedMeta && weightedPoints !== undefined ? weightedPoints : totalScans,
    defect_rate: Math.round(defectRate * 100) / 100,
    active_ops: activeOpsResult.count ?? 0,
    lots_by_stage: lotsByStage,
    top_producers: topProducers,
    total_lots: totalLotsResult.count ?? 0,
    total_scans: totalScans,
    weighted_points: weightedPoints,
    use_weighted_meta: useWeightedMeta,
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
  const fromStart = `${from}T00:00:00.000Z`;
  const toEnd = `${to}T23:59:59.999Z`;

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

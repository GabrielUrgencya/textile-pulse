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
}

export interface ChartDataPoint {
  period: string;
  scans: number;
  defects: number;
}

/**
 * Compute production KPIs using server-side aggregation (RPCs).
 * RPCs perform GROUP BY in PostgreSQL — no full-table-scans.
 */
export async function computeKpis(
  supabase: SupabaseClient,
  dateRange: DateRange
): Promise<KpiResult> {
  const { from, to } = dateRange;
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

  return {
    produced_today: totalScans,
    defect_rate: Math.round(defectRate * 100) / 100,
    active_ops: activeOpsResult.count ?? 0,
    lots_by_stage: lotsByStage,
    top_producers: topProducers,
    total_lots: totalLotsResult.count ?? 0,
    total_scans: totalScans,
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

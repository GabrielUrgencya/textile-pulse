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
 * Compute production KPIs via queries (Option A — Item 5 v2.1).
 * All quantities are computed, never denormalized.
 */
export async function computeKpis(
  supabase: SupabaseClient,
  dateRange: DateRange
): Promise<KpiResult> {
  const { from, to } = dateRange;
  const toEnd = `${to}T23:59:59.999Z`;
  const fromStart = `${from}T00:00:00.000Z`;

  // Run independent queries in parallel
  const [
    scansResult,
    defectsResult,
    activeOpsResult,
    lotsByStageResult,
    topProducersResult,
    totalLotsResult,
  ] = await Promise.all([
    // Total scans in date range
    supabase
      .from("scan_events")
      .select("id", { count: "exact", head: true })
      .gte("scanned_at", fromStart)
      .lte("scanned_at", toEnd),

    // Defect count in date range
    supabase
      .from("defect_records")
      .select("id", { count: "exact", head: true })
      .gte("detected_at", fromStart)
      .lte("detected_at", toEnd),

    // Active OPs count
    supabase
      .from("production_orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),

    // Lots grouped by current stage (for active OPs)
    supabase
      .from("lots")
      .select("current_stage_id, stages!lots_current_stage_id_fkey(name)")
      .not("current_stage_id", "is", null),

    // Top producers: users with most scans in date range
    supabase
      .from("scan_events")
      .select("user_id, profiles!scan_events_user_id_fkey(full_name)")
      .gte("scanned_at", fromStart)
      .lte("scanned_at", toEnd),

    // Total lots
    supabase
      .from("lots")
      .select("id", { count: "exact", head: true }),
  ]);

  // Compute lots by stage from raw data
  const lotsByStageMap = new Map<string, { stage_name: string; stage_id: string; count: number }>();
  if (lotsByStageResult.data) {
    for (const lot of lotsByStageResult.data) {
      const stageId = lot.current_stage_id as string;
      const stageData = lot.stages as unknown as { name: string } | { name: string }[] | null;
      const stageName = Array.isArray(stageData) ? stageData[0]?.name : stageData?.name || "Unknown";
      const existing = lotsByStageMap.get(stageId);
      if (existing) {
        existing.count++;
      } else {
        lotsByStageMap.set(stageId, { stage_id: stageId, stage_name: stageName, count: 1 });
      }
    }
  }

  // Compute top producers from raw scan data
  const producerMap = new Map<string, { user_id: string; full_name: string; scan_count: number }>();
  if (topProducersResult.data) {
    for (const scan of topProducersResult.data) {
      const userId = scan.user_id as string;
      const profileData = scan.profiles as unknown as { full_name: string } | { full_name: string }[] | null;
      const fullName = Array.isArray(profileData) ? profileData[0]?.full_name : profileData?.full_name || "Unknown";
      const existing = producerMap.get(userId);
      if (existing) {
        existing.scan_count++;
      } else {
        producerMap.set(userId, { user_id: userId, full_name: fullName, scan_count: 1 });
      }
    }
  }
  const topProducers = Array.from(producerMap.values())
    .sort((a, b) => b.scan_count - a.scan_count)
    .slice(0, 10);

  const totalScans = scansResult.count ?? 0;
  const totalDefects = defectsResult.count ?? 0;
  const defectRate = totalScans > 0 ? (totalDefects / totalScans) * 100 : 0;

  return {
    produced_today: totalScans,
    defect_rate: Math.round(defectRate * 100) / 100,
    active_ops: activeOpsResult.count ?? 0,
    lots_by_stage: Array.from(lotsByStageMap.values()),
    top_producers: topProducers,
    total_lots: totalLotsResult.count ?? 0,
    total_scans: totalScans,
  };
}

/**
 * Compute production chart data grouped by hour or day.
 */
export async function computeChartData(
  supabase: SupabaseClient,
  dateRange: DateRange,
  groupBy: "hour" | "day" = "day"
): Promise<ChartDataPoint[]> {
  const { from, to } = dateRange;
  const fromStart = `${from}T00:00:00.000Z`;
  const toEnd = `${to}T23:59:59.999Z`;

  const [scansResult, defectsResult] = await Promise.all([
    supabase
      .from("scan_events")
      .select("scanned_at")
      .gte("scanned_at", fromStart)
      .lte("scanned_at", toEnd)
      .order("scanned_at", { ascending: true }),

    supabase
      .from("defect_records")
      .select("detected_at")
      .gte("detected_at", fromStart)
      .lte("detected_at", toEnd)
      .order("detected_at", { ascending: true }),
  ]);

  const chartMap = new Map<string, { scans: number; defects: number }>();

  // Group scans
  if (scansResult.data) {
    for (const scan of scansResult.data) {
      const key = periodKey(scan.scanned_at, groupBy);
      const entry = chartMap.get(key) || { scans: 0, defects: 0 };
      entry.scans++;
      chartMap.set(key, entry);
    }
  }

  // Group defects
  if (defectsResult.data) {
    for (const defect of defectsResult.data) {
      const key = periodKey(defect.detected_at, groupBy);
      const entry = chartMap.get(key) || { scans: 0, defects: 0 };
      entry.defects++;
      chartMap.set(key, entry);
    }
  }

  return Array.from(chartMap.entries())
    .map(([period, data]) => ({ period, ...data }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

function periodKey(timestamp: string, groupBy: "hour" | "day"): string {
  const date = new Date(timestamp);
  if (groupBy === "hour") {
    return `${date.toISOString().slice(0, 13)}:00`;
  }
  return date.toISOString().slice(0, 10);
}

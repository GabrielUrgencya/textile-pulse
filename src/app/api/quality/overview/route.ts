import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { hasPermission, type AppRole } from "@/lib/permissions";

export async function GET(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;
  const role = user.app_metadata?.role;

  if (!hasPermission(role as AppRole, "quality:view")) {
    return NextResponse.json({ error: "Forbidden: quality:view required" }, { status: 403 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  // H1 FIX: Use COUNT queries instead of fetching all records into memory
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyDateFilters = (q: any) => {
    if (from) q = q.gte("created_at", from);
    if (to) q = q.lte("created_at", to);
    return q;
  };

  const [totalRes, criticalRes, resolvedRes] = await Promise.all([
    applyDateFilters(supabase.from("defect_records").select("id", { count: "exact", head: true })),
    applyDateFilters(supabase.from("defect_records").select("id", { count: "exact", head: true }).eq("severity", "CRITICAL")),
    applyDateFilters(supabase.from("defect_records").select("id", { count: "exact", head: true }).eq("status", "RESOLVED")),
  ]);

  if (totalRes.error) {
    return NextResponse.json({ error: "Failed to fetch quality overview" }, { status: 500 });
  }

  const total = totalRes.count || 0;
  const critical = criticalRes.count || 0;
  const resolved = resolvedRes.count || 0;
  const resolutionRate = total > 0 ? Math.round((resolved / total) * 1000) / 10 : 0;

  // Previous period for trend comparison
  let trendTotal = 0;
  let trendCritical = 0;
  let trendResolutionRate = 0;

  if (from && to) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const diff = toDate.getTime() - fromDate.getTime();
    const prevFrom = new Date(fromDate.getTime() - diff).toISOString();
    const prevTo = from;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const applyPrevDateFilters = (q: any) =>
      q.gte("created_at", prevFrom).lte("created_at", prevTo);

    const [prevTotalRes, prevCriticalRes, prevResolvedRes] = await Promise.all([
      applyPrevDateFilters(supabase.from("defect_records").select("id", { count: "exact", head: true })),
      applyPrevDateFilters(supabase.from("defect_records").select("id", { count: "exact", head: true }).eq("severity", "CRITICAL")),
      applyPrevDateFilters(supabase.from("defect_records").select("id", { count: "exact", head: true }).eq("status", "RESOLVED")),
    ]);

    const prevTotal = prevTotalRes.count || 0;
    trendTotal = total - prevTotal;
    trendCritical = critical - (prevCriticalRes.count || 0);
    const prevResolved = prevResolvedRes.count || 0;
    const prevRate = prevTotal > 0 ? Math.round((prevResolved / prevTotal) * 1000) / 10 : 0;
    trendResolutionRate = Math.round((resolutionRate - prevRate) * 10) / 10;
  }

  return NextResponse.json({
    data: {
      total,
      critical,
      resolved,
      resolutionRate,
      trends: {
        total: trendTotal,
        critical: trendCritical,
        resolutionRate: trendResolutionRate,
      },
    },
  });
}

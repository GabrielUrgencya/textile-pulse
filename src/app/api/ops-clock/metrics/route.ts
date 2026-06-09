import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";

const ALLOWED_ROLES = ["ADMIN", "GERENTE", "COORDENADOR"];

/**
 * GET /api/ops-clock/metrics — Aggregated metrics
 * Story 8.6 — AC6
 */
export async function GET(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;
  const role = user.app_metadata?.role;

  if (!ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const today = new Date().toISOString().slice(0, 10);
  const from = searchParams.get("from") || today;
  const to = searchParams.get("to") || today;

  const { data: records, error } = await supabase
    .from("ops_clock")
    .select("arrived_at, loading_started_at, loading_ended_at, departed_at")
    .gte("arrived_at", `${from}T00:00:00`)
    .lte("arrived_at", `${to}T23:59:59`);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const all = records || [];
  let totalWaitMinutes = 0;
  let totalLoadMinutes = 0;
  let waitCount = 0;
  let loadCount = 0;

  for (const r of all) {
    if (r.loading_started_at) {
      const wait = (new Date(r.loading_started_at).getTime() - new Date(r.arrived_at).getTime()) / 60000;
      totalWaitMinutes += wait;
      waitCount++;
    }
    if (r.loading_started_at && r.loading_ended_at) {
      const load = (new Date(r.loading_ended_at).getTime() - new Date(r.loading_started_at).getTime()) / 60000;
      totalLoadMinutes += load;
      loadCount++;
    }
  }

  return NextResponse.json({
    data: {
      total_drivers: all.length,
      avg_wait_minutes: waitCount > 0 ? Math.round(totalWaitMinutes / waitCount) : 0,
      avg_load_minutes: loadCount > 0 ? Math.round(totalLoadMinutes / loadCount) : 0,
      active_count: all.filter((r) => !r.departed_at).length,
    },
  });
}

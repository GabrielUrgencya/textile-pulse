import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateKioskToken } from "@/lib/kiosk-middleware";

/**
 * GET /api/kiosk/dashboard?token=<uuid>
 * AC5, AC9: Kiosk read-only access to dashboard KPIs via token.
 * No Supabase Auth session — uses service_role with tenant filter.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  const session = await validateKioskToken(token);
  if (!session) {
    return NextResponse.json({ error: "Invalid or revoked kiosk token" }, { status: 401 });
  }

  // Use admin client with tenant filter (read-only)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const today = new Date().toISOString().slice(0, 10);
  const fromStart = `${today}T00:00:00.000Z`;
  const toEnd = `${today}T23:59:59.999Z`;

  // Parallel queries for dashboard KPIs, all filtered by tenant
  const [scansResult, activeOpsResult, lotsByStageResult] = await Promise.all([
    supabase
      .from("scan_events")
      .select("id, lots!inner(po_id, production_orders!inner(tenant_id))", { count: "exact", head: true })
      .eq("lots.production_orders.tenant_id", session.tenantId)
      .gte("scanned_at", fromStart)
      .lte("scanned_at", toEnd),

    supabase
      .from("production_orders")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", session.tenantId)
      .eq("status", "active"),

    supabase
      .from("lots")
      .select("current_stage_id, stages!lots_current_stage_id_fkey(name)")
      .not("current_stage_id", "is", null)
      .eq("production_orders.tenant_id", session.tenantId),
  ]);

  // Simplified KPIs for kiosk (read-only)
  const lotsByStageMap = new Map<string, { stage_name: string; count: number }>();
  if (lotsByStageResult.data) {
    for (const lot of lotsByStageResult.data) {
      const stageId = lot.current_stage_id as string;
      const stageData = lot.stages as unknown as { name: string } | { name: string }[] | null;
      const stageName = Array.isArray(stageData) ? stageData[0]?.name : stageData?.name || "Unknown";
      const existing = lotsByStageMap.get(stageId);
      if (existing) {
        existing.count++;
      } else {
        lotsByStageMap.set(stageId, { stage_name: stageName, count: 1 });
      }
    }
  }

  return NextResponse.json({
    kiosk: {
      token_name: session.tokenName,
      scope: session.scope,
    },
    kpis: {
      scans_today: scansResult.count ?? 0,
      active_ops: activeOpsResult.count ?? 0,
      lots_by_stage: Array.from(lotsByStageMap.values()),
    },
    timestamp: new Date().toISOString(),
  });
}

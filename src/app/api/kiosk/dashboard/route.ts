import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateKioskToken } from "@/lib/kiosk-middleware";

/**
 * GET /api/kiosk/dashboard?token=<uuid>
 * Kiosk read-only access to dashboard KPIs via token.
 * No Supabase Auth session — uses service_role with tenant filter.
 *
 * Returns: kiosk info, KPIs, OPs with progress by stage, stale lots (>2h).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  const session = await validateKioskToken(token);
  if (!session) {
    return NextResponse.json({ error: "Invalid or revoked kiosk token" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const today = new Date().toISOString().slice(0, 10);
  const fromStart = `${today}T00:00:00.000Z`;
  const toEnd = `${today}T23:59:59.999Z`;

  // Two hours ago for stale lot detection
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  // Parallel queries for all dashboard data
  const [scansResult, activeOpsResult, lotsByStageResult, opsResult, staleLotResult] = await Promise.all([
    // Scans today
    supabase
      .from("scan_events")
      .select("id, lots!inner(po_id, production_orders!inner(tenant_id))", { count: "exact", head: true })
      .eq("lots.production_orders.tenant_id", session.tenantId)
      .gte("scanned_at", fromStart)
      .lte("scanned_at", toEnd),

    // Active OPs count
    supabase
      .from("production_orders")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", session.tenantId)
      .eq("status", "active"),

    // Lots by stage (existing)
    supabase
      .from("lots")
      .select("current_stage_id, stages!lots_current_stage_id_fkey(name)")
      .not("current_stage_id", "is", null)
      .eq("production_orders.tenant_id", session.tenantId),

    // OPs with lots for progress calculation
    supabase
      .from("production_orders")
      .select(`
        id, op_number, product_name, total_quantity,
        lots (
          id, status, current_stage_id,
          stages!lots_current_stage_id_fkey ( name, display_name, order_index )
        )
      `)
      .eq("tenant_id", session.tenantId)
      .eq("status", "active")
      .order("created_at", { ascending: false }),

    // Stale lots: entered current stage > 2h ago, excluding terminal/initial statuses
    supabase
      .from("lots")
      .select(`
        id, barcode, lot_number, entered_current_stage_at, status,
        stages!lots_current_stage_id_fkey ( display_name ),
        production_orders!inner ( op_number, tenant_id )
      `)
      .eq("production_orders.tenant_id", session.tenantId)
      .lt("entered_current_stage_at", twoHoursAgo)
      .not("status", "in", "(CREATED,IN_STOCK,PARTIALLY_STOCKED)")
      .not("current_stage_id", "is", null),
  ]);

  // Process lots_by_stage (existing logic)
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

  // Process OPs with progress by stage
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ops = (opsResult.data || []).map((op: any) => {
    const lots = op.lots || [];
    const lotsCount = lots.length;

    // Count lots by stage
    const stageMap = new Map<string, { stage_name: string; count: number; order_index: number }>();
    let completedLots = 0;

    for (const lot of lots) {
      // Lots in IN_STOCK or IN_PACKING are considered "completed"
      if (lot.status === "IN_STOCK" || lot.status === "IN_PACKING" || lot.status === "PARTIALLY_STOCKED") {
        completedLots++;
      }

      const stage = lot.stages as { display_name: string; name: string; order_index: number } | null;
      if (stage) {
        const key = stage.display_name || stage.name;
        const existing = stageMap.get(key);
        if (existing) {
          existing.count++;
        } else {
          stageMap.set(key, { stage_name: key, count: 1, order_index: stage.order_index ?? 0 });
        }
      }
    }

    // Sort stages by order_index
    const lotsByStage = Array.from(stageMap.values())
      .sort((a, b) => a.order_index - b.order_index)
      .map(({ stage_name, count }) => ({ stage_name, count }));

    const progressPercent = lotsCount > 0 ? Math.round((completedLots / lotsCount) * 100) : 0;

    return {
      id: op.id,
      op_number: op.op_number,
      product_name: op.product_name,
      total_quantity: op.total_quantity,
      lots_count: lotsCount,
      lots_by_stage: lotsByStage,
      progress_percent: progressPercent,
    };
  });

  // Process stale lots
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const staleLots = (staleLotResult.data || []).map((lot: any) => {
    const enteredAt = new Date(lot.entered_current_stage_at);
    const hoursStalled = Math.round((Date.now() - enteredAt.getTime()) / (1000 * 60 * 60) * 10) / 10;

    const stage = lot.stages as { display_name: string } | null;
    const po = lot.production_orders as { op_number: string } | null;

    return {
      barcode: lot.barcode,
      lot_number: lot.lot_number,
      op_number: po?.op_number || "—",
      stage_name: stage?.display_name || "—",
      hours_stalled: hoursStalled,
      entered_current_stage_at: lot.entered_current_stage_at,
    };
  }).sort((a: { hours_stalled: number }, b: { hours_stalled: number }) => b.hours_stalled - a.hours_stalled);

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
    ops,
    stale_lots: staleLots,
    timestamp: new Date().toISOString(),
  });
}

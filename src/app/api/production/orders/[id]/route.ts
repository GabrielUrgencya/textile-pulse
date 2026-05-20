import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase } = auth;

  const { id } = params;

  // Phase 1: Fetch order, lots, and ESTOQUE stage in parallel
  const [orderResult, lotsResult, stageResult] = await Promise.all([
    supabase
      .from("production_orders")
      .select("*")
      .eq("id", id)
      .single(),
    supabase
      .from("lots")
      .select("id, barcode, lot_number, quantity, current_stage_id, status, created_at")
      .eq("po_id", id)
      .order("lot_number", { ascending: true }),
    supabase
      .from("stages")
      .select("id")
      .eq("name", "ESTOQUE")
      .single(),
  ]);

  if (orderResult.error || !orderResult.data) {
    return NextResponse.json(
      { error: "Production order not found" },
      { status: 404 }
    );
  }

  const order = orderResult.data;
  const lots = lotsResult.data || [];

  let produced = 0;
  let stocked = 0;
  let defect = 0;
  let discarded = 0;

  if (lots.length > 0) {
    const lotIds = lots.map((l) => l.id);

    // Phase 2: Fetch scan_events and defect_records in parallel
    const [scanResult, defectResult] = await Promise.all([
      stageResult.data
        ? supabase
            .from("scan_events")
            .select("id", { count: "exact", head: true })
            .in("lot_id", lotIds)
            .eq("stage_id", stageResult.data.id)
            .eq("event_type", "STAGE_IN")
        : Promise.resolve({ count: 0 }),
      supabase
        .from("defect_records")
        .select("quantity, discarded_quantity")
        .in("lot_id", lotIds),
    ]);

    produced = ("count" in scanResult ? scanResult.count : 0) || 0;
    stocked = lots.filter((l) => l.status === "IN_STOCK").length;

    if ("data" in defectResult && defectResult.data) {
      for (const d of defectResult.data) {
        defect += d.quantity || 0;
        discarded += d.discarded_quantity || 0;
      }
    }
  }

  return NextResponse.json({
    order,
    lots,
    computed_quantities: {
      produced,
      stocked,
      defect,
      discarded,
    },
  });
}

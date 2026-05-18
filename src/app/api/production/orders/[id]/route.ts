import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = params;

  // Fetch the production order (RLS filters by tenant)
  const { data: order, error: orderError } = await supabase
    .from("production_orders")
    .select("*")
    .eq("id", id)
    .single();

  if (orderError || !order) {
    return NextResponse.json(
      { error: "Production order not found" },
      { status: 404 }
    );
  }

  // Fetch lots for this order
  const { data: lots } = await supabase
    .from("lots")
    .select("id, barcode, lot_number, quantity, current_stage_id, status, created_at")
    .eq("po_id", id)
    .order("lot_number", { ascending: true });

  // AC5: Compute quantities via query over scan_events and defect_records
  // Get the final stage (ESTOQUE) for produced count
  const { data: finalStage } = await supabase
    .from("stages")
    .select("id")
    .eq("name", "ESTOQUE")
    .single();

  let produced = 0;
  let stocked = 0;
  let defect = 0;
  let discarded = 0;

  if (lots && lots.length > 0) {
    const lotIds = lots.map((l) => l.id);

    // Produced: lots that reached ESTOQUE stage
    if (finalStage) {
      const { count: producedCount } = await supabase
        .from("scan_events")
        .select("id", { count: "exact", head: true })
        .in("lot_id", lotIds)
        .eq("stage_id", finalStage.id)
        .eq("event_type", "STAGE_IN");

      produced = producedCount || 0;
    }

    // Stocked: lots with status IN_STOCK
    stocked = lots.filter((l) => l.status === "IN_STOCK").length;

    // Defect + Discarded: from defect_records
    const { data: defectAgg } = await supabase
      .from("defect_records")
      .select("quantity, discarded_quantity")
      .in("lot_id", lotIds);

    if (defectAgg) {
      defectAgg.forEach((d) => {
        defect += d.quantity || 0;
        discarded += d.discarded_quantity || 0;
      });
    }
  }

  return NextResponse.json({
    order,
    lots: lots || [],
    computed_quantities: {
      produced,
      stocked,
      defect,
      discarded,
    },
  });
}

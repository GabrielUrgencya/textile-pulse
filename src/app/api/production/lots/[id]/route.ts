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

  // Fetch lot (RLS filters by tenant via lots→po→tenant_id chain)
  const { data: lot, error: lotError } = await supabase
    .from("lots")
    .select("*, production_orders(op_number, product_name, reference)")
    .eq("id", id)
    .single();

  if (lotError || !lot) {
    return NextResponse.json({ error: "Lot not found" }, { status: 404 });
  }

  // Fetch scan history
  const { data: scans } = await supabase
    .from("scan_events")
    .select("id, stage_id, user_id, event_type, scanned_at, device_info")
    .eq("lot_id", id)
    .order("scanned_at", { ascending: true });

  // Fetch defect records
  const { data: defects } = await supabase
    .from("defect_records")
    .select("id, quantity, defect_type, severity, description, detected_at, status, discarded_quantity")
    .eq("lot_id", id)
    .order("detected_at", { ascending: true });

  return NextResponse.json({
    lot,
    scan_history: scans || [],
    defect_records: defects || [],
  });
}

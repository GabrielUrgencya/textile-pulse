import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function GET(
  _request: Request,
  { params }: { params: { lotId: string } }
) {
  const supabase = createSupabaseServerClient();

  // Verify authentication
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lotId } = params;

  if (!lotId) {
    return NextResponse.json(
      { error: "lotId is required" },
      { status: 400 }
    );
  }

  // Verify lot exists (RLS will filter by tenant)
  const { data: lot, error: lotError } = await supabase
    .from("lots")
    .select("id, barcode, current_stage_id, status")
    .eq("id", lotId)
    .single();

  if (lotError || !lot) {
    return NextResponse.json({ error: "Lot not found" }, { status: 404 });
  }

  // Fetch scan history ordered by scanned_at
  const { data: history, error: historyError } = await supabase
    .from("scan_events")
    .select(
      "id, stage_id, user_id, event_type, scanned_at, device_info, metadata, quantity_scanned, quantity_ok, quantity_defect"
    )
    .eq("lot_id", lotId)
    .order("scanned_at", { ascending: true });

  if (historyError) {
    return NextResponse.json(
      { error: "Failed to fetch scan history" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    lot: {
      id: lot.id,
      barcode: lot.barcode,
      current_stage_id: lot.current_stage_id,
      status: lot.status,
    },
    scan_count: history?.length || 0,
    history: history || [],
  });
}

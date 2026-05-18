import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateFactionSession } from "@/lib/faction-middleware";

/**
 * GET /api/faction/shipments/[id]
 * AC3: Returns shipment details + lot info + value.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await validateFactionSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from("faction_shipments")
    .select(
      "*, lots!inner(barcode, lot_number, quantity, production_orders!inner(op_number, product_name, reference)), defect_records(id, quantity, defect_type, severity, description, photo_url, detected_at, faction_response, faction_response_at, contestation_reason)"
    )
    .eq("id", id)
    .eq("faction_id", session.factionId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Shipment not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

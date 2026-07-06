import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";
import { dbError } from "@/lib/api-helpers";

/**
 * GET /api/shipments/[id]/events — Drawer da remessa (épico Robustez F3):
 * dados completos da remessa + timeline (todos os eventos, inclusive internos).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  if (!can(user, "factions:view")) {
    return NextResponse.json({ error: "Forbidden: factions:view required" }, { status: 403 });
  }

  const { id } = await params;

  const [shipmentRes, eventsRes] = await Promise.all([
    supabase
      .from("faction_shipments")
      .select(
        `id, status, quantity_sent, quantity_returned, quantity_defective, shortage_qty,
         sent_at, expected_return_at, actual_return_at, closed_at, closed_by, created_at,
         payment_value, deduction_value, released_value, retained_value, payment_status,
         reconciliation_status, notes, faction_id,
         factions ( id, name ),
         lots ( barcode, lot_number, production_orders ( op_number, product_name ) )`,
      )
      .eq("id", id)
      .single(),
    supabase
      .from("shipment_events")
      .select("id, event_type, actor_type, actor_name, visible_to_faction, payload, created_at")
      .eq("shipment_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (shipmentRes.error || !shipmentRes.data) {
    return NextResponse.json({ error: "Remessa não encontrada" }, { status: 404 });
  }
  if (eventsRes.error) return dbError("GET /api/shipments/[id]/events", eventsRes.error);

  return NextResponse.json({
    data: { shipment: shipmentRes.data, events: eventsRes.data || [] },
  });
}

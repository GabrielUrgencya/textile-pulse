import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";

/**
 * POST /api/aduana/validate
 * Story 8.5 — AC2-AC6, AC9
 * Validates a scanned barcode against selected shipments.
 * Returns color feedback (GREEN/AMBER/RED) and registers validation record.
 */
export async function POST(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;

  if (!can(user, "scan:execute")) {
    return NextResponse.json(
      { error: "Forbidden: scan:execute required" },
      { status: 403 }
    );
  }

  let body: {
    barcode?: string;
    shipmentIds?: string[];
    driverId?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { barcode, shipmentIds, driverId } = body;

  if (!barcode || !shipmentIds || shipmentIds.length === 0) {
    return NextResponse.json(
      { error: "barcode and shipmentIds are required" },
      { status: 400 }
    );
  }

  // Find lot by barcode
  const { data: lot } = await supabase
    .from("lots")
    .select("id, barcode, lot_number, status, production_orders(op_number, product_name)")
    .eq("barcode", barcode)
    .limit(1)
    .single();

  if (!lot) {
    // AC4: Lot not found = RED
    const record = {
      lot_id: null as string | null,
      shipment_id: null as string | null,
      driver_id: driverId || null,
      scanned_by: user.id,
      alert_color: "RED",
      alert_reason: "Lote não encontrado no sistema",
    };

    // Can't insert without lot_id due to FK constraint, just return the result
    return NextResponse.json({
      data: {
        color: "RED",
        reason: "BLOQUEADO — Lote não encontrado",
        lot: null,
        record,
      },
    });
  }

  // Check if lot belongs to any of the selected shipments
  const { data: shipmentLots } = await supabase
    .from("faction_shipments")
    .select("id, faction_id, factions(name)")
    .in("id", shipmentIds)
    .eq("lot_id", lot.id);

  // Also check if lot belongs to OTHER shipments (for AMBER warning)
  const { data: otherShipments } = await supabase
    .from("faction_shipments")
    .select("id, faction_id, factions(name)")
    .eq("lot_id", lot.id)
    .not("id", "in", `(${shipmentIds.join(",")})`);

  let alertColor: "GREEN" | "AMBER" | "RED";
  let alertReason: string;
  let matchedShipmentId: string | null = null;

  if (shipmentLots && shipmentLots.length > 0) {
    // AC2: Lot belongs to selected shipment = GREEN
    alertColor = "GREEN";
    alertReason = "OK — Rota correta";
    matchedShipmentId = shipmentLots[0].id;
  } else if (otherShipments && otherShipments.length > 0) {
    // AC3: Lot belongs to another shipment = AMBER
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const f = otherShipments[0].factions as any;
    const fName = Array.isArray(f) ? f[0]?.name : f?.name;
    alertColor = "AMBER";
    alertReason = `ATENÇÃO — Lote de outra remessa${fName ? ` (${fName})` : ""}`;
    matchedShipmentId = otherShipments[0].id;
  } else {
    // Lot exists but not in any shipment = AMBER (unexpected scenario)
    alertColor = "AMBER";
    alertReason = "ATENÇÃO — Lote não vinculado a nenhuma remessa";
  }

  // Register validation in aduana_validations
  await supabase.from("aduana_validations").insert({
    lot_id: lot.id,
    shipment_id: matchedShipmentId,
    driver_id: driverId || null,
    scanned_by: user.id,
    alert_color: alertColor,
    alert_reason: alertReason,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const po = lot.production_orders as any;

  return NextResponse.json({
    data: {
      color: alertColor,
      reason: alertReason,
      lot: {
        id: lot.id,
        barcode: lot.barcode,
        lotNumber: lot.lot_number,
        status: lot.status,
        opNumber: po?.op_number || null,
        productName: po?.product_name || null,
      },
    },
  });
}

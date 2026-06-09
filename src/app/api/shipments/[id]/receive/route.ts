import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { hasPermission, type AppRole } from "@/lib/permissions";
import { dbError } from "@/lib/api-helpers";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;
  const role = user.app_metadata?.role;

  if (!hasPermission(role as AppRole, "factions:manage")) {
    return NextResponse.json({ error: "Forbidden: factions:manage required" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);

  if (!body || body.returnedQuantity === undefined) {
    return NextResponse.json({ error: "returnedQuantity is required" }, { status: 400 });
  }

  // Fetch shipment + faction price for financial calculation (Story 8.9)
  const { data: shipment } = await supabase
    .from("faction_shipments")
    .select("faction_id, quantity_defective")
    .eq("id", id)
    .single();

  let paymentValue: number | null = null;
  let deductionValue = 0;

  if (shipment) {
    const { data: faction } = await supabase
      .from("factions")
      .select("price_per_piece")
      .eq("id", shipment.faction_id)
      .single();

    const pricePerPiece = Number(faction?.price_per_piece || 0);
    const returnedQty = Number(body.returnedQuantity || 0);
    const defectiveQty = Number(body.quantityDefective ?? shipment.quantity_defective ?? 0);

    paymentValue = returnedQty * pricePerPiece;
    deductionValue = defectiveQty * pricePerPiece;
  }

  const updateData: Record<string, unknown> = {
    status: "RECEIVED",
    returned_quantity: body.returnedQuantity,
    received_at: new Date().toISOString(),
    notes: body.notes || null,
  };

  if (paymentValue !== null) {
    updateData.payment_value = paymentValue;
    updateData.deduction_value = deductionValue;
  }
  if (body.quantityDefective !== undefined) {
    updateData.quantity_defective = body.quantityDefective;
  }

  const { error } = await supabase
    .from("faction_shipments")
    .update(updateData)
    .eq("id", id);

  if (error) return dbError("PATCH /api/shipments/[id]/receive", error);

  return NextResponse.json({ data: { success: true } });
}

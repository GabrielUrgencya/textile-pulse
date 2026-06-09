import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateFactionSession } from "@/lib/faction-middleware";
import { validateDeliveryCode } from "@/lib/delivery-code";

/**
 * PATCH /api/faction/shipments/[id]/confirm
 * Story 6.5 — AC1, AC10 + Story 8.2 — AC3, AC4, AC5
 * Confirms shipment receipt: validates delivery code, sets faction_confirmed_at
 * and status to RECEIVED_BY_FACTION.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await validateFactionSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Parse body to get delivery code
  let body: { deliveryCode?: string } = {};
  try {
    body = await request.json();
  } catch {
    // Body may be empty for legacy calls without delivery code
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Validate ownership + status + delivery code fields
  const { data: shipment, error: fetchError } = await supabase
    .from("faction_shipments")
    .select("id, faction_id, status, faction_confirmed_at, delivery_code, delivery_code_expires_at, delivery_code_attempts")
    .eq("id", id)
    .eq("faction_id", session.factionId)
    .single();

  if (fetchError || !shipment) {
    return NextResponse.json({ error: "Shipment not found" }, { status: 404 });
  }

  if (shipment.status !== "SENT") {
    return NextResponse.json(
      { error: "INVALID_STATUS", message: "Shipment must be in SENT status to confirm" },
      { status: 422 }
    );
  }

  if (shipment.faction_confirmed_at) {
    return NextResponse.json(
      { error: "ALREADY_CONFIRMED", message: "Shipment already confirmed" },
      { status: 409 }
    );
  }

  // Story 8.2: Validate delivery code if shipment has one
  if (shipment.delivery_code) {
    if (!body.deliveryCode) {
      return NextResponse.json(
        { error: "DELIVERY_CODE_REQUIRED", message: "Código de entrega é obrigatório" },
        { status: 400 }
      );
    }

    const validation = validateDeliveryCode(shipment, body.deliveryCode);

    if (!validation.valid) {
      // Increment attempts counter on invalid/expired attempts (not when already blocked)
      if (validation.errorCode !== "BLOCKED" && validation.errorCode !== "NO_CODE") {
        await supabase
          .from("faction_shipments")
          .update({ delivery_code_attempts: (shipment.delivery_code_attempts || 0) + 1 })
          .eq("id", id);
      }

      const statusCode = validation.errorCode === "BLOCKED" ? 429 : 400;
      return NextResponse.json(
        { error: validation.errorCode, message: validation.error },
        { status: statusCode }
      );
    }
  }

  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("faction_shipments")
    .update({
      faction_confirmed_at: now,
      status: "RECEIVED_BY_FACTION",
      delivery_code_attempts: 0, // Reset on success
    })
    .eq("id", id)
    .eq("faction_id", session.factionId);

  if (updateError) {
    console.error("[faction/confirm] Update error:", updateError);
    return NextResponse.json({ error: "Failed to confirm shipment" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    shipmentId: id,
    confirmedAt: now,
    status: "RECEIVED_BY_FACTION",
  });
}

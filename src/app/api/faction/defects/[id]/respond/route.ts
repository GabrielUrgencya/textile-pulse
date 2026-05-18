import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateFactionSession } from "@/lib/faction-middleware";
import { sendNotification } from "@/lib/notification-service";

/**
 * PATCH /api/faction/defects/[id]/respond
 * Story 6.5 — AC6, AC7, AC8, AC10
 * Faction confirms or contests a defect.
 * R1: Records faction_response_at for 3 business-day countdown.
 * R2: Triple notification on contestation (internal + email).
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

  let body: { response: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.response || !["CONFIRMED", "CONTESTED"].includes(body.response)) {
    return NextResponse.json(
      { error: "INVALID_RESPONSE", message: "response must be CONFIRMED or CONTESTED" },
      { status: 400 }
    );
  }

  // Contestation requires a reason
  if (body.response === "CONTESTED" && (!body.reason || body.reason.trim().length === 0)) {
    return NextResponse.json(
      { error: "REASON_REQUIRED", message: "contestation_reason is required when contesting" },
      { status: 400 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Fetch defect with ownership validation via shipment → faction_id
  const { data: defect, error: fetchError } = await supabase
    .from("defect_records")
    .select(
      "id, faction_response, shipment_id, defect_type, severity, description, photo_url, quantity, faction_shipments!inner(id, faction_id, deduction_value, lots!inner(barcode))"
    )
    .eq("id", id)
    .single();

  if (fetchError || !defect) {
    return NextResponse.json({ error: "Defect not found" }, { status: 404 });
  }

  // AC10: Validate ownership through shipment
  const shipment = defect.faction_shipments as unknown as {
    id: string;
    faction_id: string;
    deduction_value: number;
    lots: { barcode: string } | { barcode: string }[];
  };

  if (shipment.faction_id !== session.factionId) {
    return NextResponse.json({ error: "Defect not found" }, { status: 404 });
  }

  // Prevent duplicate response
  if (defect.faction_response) {
    return NextResponse.json(
      { error: "ALREADY_RESPONDED", message: "Defect already has a response" },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();

  // R1: Record timestamp for business-day countdown
  const updatePayload: Record<string, unknown> = {
    faction_response: body.response,
    faction_response_at: now,
  };

  if (body.response === "CONTESTED") {
    updatePayload.contestation_reason = body.reason!.trim();
  }

  const { error: updateError } = await supabase
    .from("defect_records")
    .update(updatePayload)
    .eq("id", id);

  if (updateError) {
    console.error("[faction/respond] Update error:", updateError);
    return NextResponse.json({ error: "Failed to update defect response" }, { status: 500 });
  }

  // R2: Triple notification when contesting
  if (body.response === "CONTESTED") {
    const lotBarcode = getLotBarcode(shipment);
    const deductionValue = shipment.deduction_value || 0;

    await sendNotification({
      tenantId: session.tenantId,
      type: "DEFECT_CONTESTED",
      title: `Contestação de Defeito — ${session.factionName}`,
      message: `A facção ${session.factionName} contestou o defeito do lote ${lotBarcode}. Valor em disputa: R$ ${Number(deductionValue).toFixed(2)}. Prazo para resolver: 3 dias úteis. Motivo: ${body.reason}`,
      severity: "CRITICAL",
      factionId: session.factionId,
      channels: ["internal", "email"],
      recipientRoles: ["ADMIN", "GERENTE"],
      metadata: {
        defectId: id,
        shipmentId: shipment.id,
        lotBarcode,
        disputeValue: deductionValue,
        contestationReason: body.reason,
        photoUrl: defect.photo_url,
      },
    });
  }

  return NextResponse.json({
    success: true,
    defectId: id,
    response: body.response,
    respondedAt: now,
  });
}

function getLotBarcode(shipment: {
  lots: { barcode: string } | { barcode: string }[];
}): string {
  if (Array.isArray(shipment.lots)) return shipment.lots[0]?.barcode || "N/A";
  return shipment.lots?.barcode || "N/A";
}

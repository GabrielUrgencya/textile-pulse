import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateFactionSession } from "@/lib/faction-middleware";
import { sendNotification } from "@/lib/notification-service";

/**
 * PATCH /api/faction/returns/[id]/estimate
 * Story 6.5 — AC2, AC3, AC4, AC5, AC10
 * Sets or reschedules the estimated return date.
 * R3: max 2 reschedules with escalation.
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

  let body: { estimatedReturn: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.estimatedReturn) {
    return NextResponse.json(
      { error: "MISSING_FIELD", message: "estimatedReturn is required" },
      { status: 400 }
    );
  }

  const estimatedDate = new Date(body.estimatedReturn);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (isNaN(estimatedDate.getTime()) || estimatedDate <= today) {
    return NextResponse.json(
      { error: "INVALID_DATE", message: "estimatedReturn must be a valid future date" },
      { status: 422 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Fetch shipment with ownership check
  const { data: shipment, error: fetchError } = await supabase
    .from("faction_shipments")
    .select("id, faction_id, reschedule_count, status, lots!inner(barcode)")
    .eq("id", id)
    .eq("faction_id", session.factionId)
    .single();

  if (fetchError || !shipment) {
    return NextResponse.json({ error: "Shipment not found" }, { status: 404 });
  }

  // R3: Check reschedule limit
  if (shipment.reschedule_count >= 2) {
    // Notify manager about blocked 3rd attempt
    await sendNotification({
      tenantId: session.tenantId,
      type: "RESCHEDULE_BLOCKED",
      title: `Reagendamento bloqueado — ${session.factionName}`,
      message: `Facção ${session.factionName} tentou terceiro reagendamento no lote ${getLotBarcode(shipment)}. Ação bloqueada. Intervenção manual necessária.`,
      severity: "CRITICAL",
      factionId: session.factionId,
      channels: ["internal", "email"],
      recipientRoles: ["ADMIN", "GERENTE"],
    });

    return NextResponse.json(
      {
        error: "RESCHEDULE_LIMIT_REACHED",
        message: "Limite de reagendamentos atingido. Entre em contato com a Liserie.",
      },
      { status: 403 }
    );
  }

  const now = new Date().toISOString();
  const isReschedule = shipment.reschedule_count > 0 || shipment.status === "RECEIVED_BY_FACTION";
  const newCount = isReschedule ? shipment.reschedule_count + 1 : shipment.reschedule_count;

  // Build update payload
  const updatePayload: Record<string, unknown> = {
    faction_estimated_return: body.estimatedReturn,
    faction_estimated_return_at: now,
  };

  // Only increment reschedule if this is a reschedule (already had an estimate)
  if (isReschedule) {
    updatePayload.reschedule_count = newCount;
    updatePayload.last_rescheduled_at = now;
  }

  // R3: Second reschedule → OVERDUE
  if (newCount >= 2) {
    updatePayload.status = "OVERDUE";
  }

  const { error: updateError } = await supabase
    .from("faction_shipments")
    .update(updatePayload)
    .eq("id", id)
    .eq("faction_id", session.factionId);

  if (updateError) {
    console.error("[faction/estimate] Update error:", updateError);
    return NextResponse.json({ error: "Failed to update estimate" }, { status: 500 });
  }

  const lotBarcode = getLotBarcode(shipment);

  // R3: Notifications based on reschedule count
  if (isReschedule && newCount === 1) {
    // First reschedule → WARNING (internal only) — AC4
    await sendNotification({
      tenantId: session.tenantId,
      type: "RETURN_RESCHEDULED",
      title: `Reagendamento de devolução — ${session.factionName}`,
      message: `Facção ${session.factionName} reagendou a devolução do lote ${lotBarcode} para ${body.estimatedReturn}.`,
      severity: "WARNING",
      factionId: session.factionId,
      channels: ["internal"],
      recipientRoles: ["ADMIN", "GERENTE"],
    });
  } else if (isReschedule && newCount === 2) {
    // Second reschedule → CRITICAL + email + OVERDUE — AC5
    await sendNotification({
      tenantId: session.tenantId,
      type: "RETURN_RESCHEDULED_CRITICAL",
      title: `ATENÇÃO — Segunda alteração de prazo — ${session.factionName}`,
      message: `ATENÇÃO — Segunda alteração de prazo pela Facção ${session.factionName} no lote ${lotBarcode}. Devolução agora prevista para ${body.estimatedReturn}.`,
      severity: "CRITICAL",
      factionId: session.factionId,
      channels: ["internal", "email"],
      recipientRoles: ["ADMIN", "GERENTE"],
    });
  }

  return NextResponse.json({
    success: true,
    shipmentId: id,
    estimatedReturn: body.estimatedReturn,
    rescheduleCount: isReschedule ? newCount : shipment.reschedule_count,
    status: newCount >= 2 ? "OVERDUE" : shipment.status,
  });
}

function getLotBarcode(shipment: Record<string, unknown>): string {
  const lots = shipment.lots as { barcode: string } | { barcode: string }[];
  if (Array.isArray(lots)) return lots[0]?.barcode || "N/A";
  return lots?.barcode || "N/A";
}

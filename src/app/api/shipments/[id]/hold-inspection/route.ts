import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";
import { dbError } from "@/lib/api-helpers";
import { validateDeliveryCode } from "@/lib/delivery-code";
import { logShipmentEvent, actorNameFromUser } from "@/lib/shipment-events";

/**
 * PATCH /api/shipments/[id]/hold-inspection — Frente 3.
 *
 * "Aguardar conferência": a fábrica RECEBE fisicamente a devolução (digita o
 * código do motorista) mas NÃO confere agora — lotes grandes levam dias. A
 * remessa vai para AWAITING_INSPECTION; o admin registra defeitos ao longo dos
 * dias (/api/defects) e fecha o financeiro só em /finalize-inspection.
 *
 * NÃO paga nada aqui: payment_status/released_value permanecem PENDING/0, então
 * o "a receber" já exclui a remessa até a conferência final.
 *
 * Coexiste com o /receive (conferência cega imediata) — o admin escolhe. Opera
 * só sobre RETURN_DECLARED, o mesmo pré-requisito do /receive.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;

  if (!can(user, "factions:manage")) {
    return NextResponse.json({ error: "Forbidden: factions:manage required" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const returnCode: string | undefined = body?.returnCode;

  const { data: shipment, error: fetchError } = await supabase
    .from("faction_shipments")
    .select(
      "id, faction_id, lot_id, tenant_id, status, return_code, return_code_expires_at, return_code_attempts",
    )
    .eq("id", id)
    .single();

  if (fetchError || !shipment) {
    return NextResponse.json({ error: "Shipment not found" }, { status: 404 });
  }

  if (shipment.status !== "RETURN_DECLARED") {
    return NextResponse.json(
      {
        error: "INVALID_STATUS",
        message: "A remessa precisa estar em 'Devolução declarada' para receber",
      },
      { status: 422 },
    );
  }

  // Mesmo gate de código do /receive: prova que os itens chegaram pelo motorista.
  const codeValidation = validateDeliveryCode(
    {
      delivery_code: shipment.return_code,
      delivery_code_expires_at: shipment.return_code_expires_at,
      delivery_code_attempts: shipment.return_code_attempts || 0,
    },
    returnCode || "",
  );

  if (!codeValidation.valid) {
    if (codeValidation.errorCode !== "BLOCKED" && codeValidation.errorCode !== "NO_CODE") {
      await supabase
        .from("faction_shipments")
        .update({ return_code_attempts: (shipment.return_code_attempts || 0) + 1 })
        .eq("id", id);
    }
    const statusCode = codeValidation.errorCode === "BLOCKED" ? 429 : 400;
    return NextResponse.json(
      { error: codeValidation.errorCode, message: codeValidation.error },
      { status: statusCode },
    );
  }

  const { error: updateError } = await supabase
    .from("faction_shipments")
    .update({
      status: "AWAITING_INSPECTION",
      // Recebida fisicamente agora; a conferência (contagem/pagamento) vem depois.
      actual_return_at: new Date().toISOString(),
      return_code_attempts: 0,
    })
    .eq("id", id);

  if (updateError) return dbError("PATCH /api/shipments/[id]/hold-inspection", updateError);

  if (shipment.tenant_id) {
    await logShipmentEvent(supabase, {
      tenantId: shipment.tenant_id as string,
      shipmentId: id,
      eventType: "RECEIVED",
      actorType: "ADMIN",
      actorName: actorNameFromUser(user),
      payload: { status: "AWAITING_INSPECTION", mode: "hold_for_inspection" },
    });
  }

  return NextResponse.json({ data: { status: "AWAITING_INSPECTION" } });
}

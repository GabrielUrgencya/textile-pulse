import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";
import { notifyFaction, FACTION_NOTIFICATION_TYPES } from "@/lib/faction-notifications";
import { logShipmentEvent, actorNameFromUser } from "@/lib/shipment-events";
import { localDayEnd } from "@/lib/tz";

/**
 * PATCH /api/shipments/[id]/deadline — Edição de prazo (épico Robustez F3).
 * Só para remessa ATIVA (não RETURNED/CLOSED). Evento DEADLINE_CHANGED com
 * from/to + notificação à facção.
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
  const expectedReturn = body?.expectedReturn as string | undefined;

  if (!expectedReturn || Number.isNaN(new Date(expectedReturn).getTime())) {
    return NextResponse.json({ error: "expectedReturn (data válida) é obrigatório" }, { status: 400 });
  }

  const { data: shipment, error: fetchError } = await supabase
    .from("faction_shipments")
    .select("id, tenant_id, faction_id, status, expected_return_at")
    .eq("id", id)
    .single();

  if (fetchError || !shipment) {
    return NextResponse.json({ error: "Remessa não encontrada" }, { status: 404 });
  }

  if (["RETURNED", "CLOSED"].includes(shipment.status as string)) {
    return NextResponse.json(
      { error: "Prazo só pode ser editado em remessas ativas" },
      { status: 422 },
    );
  }

  // Fix fuso: normaliza a data escolhida para o FIM do dia no fuso do tenant
  // (colunas timestamptz). slice(0,10) aceita "YYYY-MM-DD" ou ISO completo.
  const expectedReturnAt = localDayEnd(expectedReturn.slice(0, 10));
  const { error: updateError } = await supabase
    .from("faction_shipments")
    .update({ expected_return_at: expectedReturnAt, expected_return: expectedReturnAt })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await logShipmentEvent(supabase, {
    tenantId: shipment.tenant_id as string,
    shipmentId: id,
    eventType: "DEADLINE_CHANGED",
    actorType: "ADMIN",
    actorName: actorNameFromUser(user),
    payload: { from: shipment.expected_return_at, to: expectedReturn },
  });

  if (shipment.tenant_id && shipment.faction_id) {
    const prazo = new Date(expectedReturn).toLocaleDateString("pt-BR");
    await notifyFaction(supabase, {
      tenantId: shipment.tenant_id as string,
      factionId: shipment.faction_id as string,
      type: FACTION_NOTIFICATION_TYPES.SHIPMENT_NEW,
      title: "Prazo atualizado",
      message: `O prazo de devolução da remessa foi atualizado para ${prazo}.`,
      entityType: "shipment",
      entityId: id,
    });
  }

  return NextResponse.json({ data: { id, expected_return_at: expectedReturn } });
}

import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";
import { notifyFaction, FACTION_NOTIFICATION_TYPES, brl } from "@/lib/faction-notifications";
import { logShipmentEvent, actorNameFromUser } from "@/lib/shipment-events";

/**
 * POST /api/shipments/[id]/close — Encerramento da remessa (épico Robustez F2).
 *
 * Critérios (todos obrigatórios; 422 lista o que falta):
 *  1. Devolução recebida: status RETURNED | PARTIALLY_RETURNED
 *  2. Conferência feita: reconciliation_status preenchido
 *  3. Financeiro lançado: payment_status != PENDING
 *  4. Ação explícita do admin (este endpoint)
 * Defeitos sem resposta da facção NÃO bloqueiam — viram warning na resposta.
 * Auto-close por tempo: cron futuro (documentado, fora de escopo).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  if (!can(user, "factions:manage")) {
    return NextResponse.json({ error: "Forbidden: factions:manage required" }, { status: 403 });
  }

  const { id } = await params;

  const { data: shipment, error: fetchError } = await supabase
    .from("faction_shipments")
    .select(
      "id, tenant_id, faction_id, status, reconciliation_status, payment_status, released_value, retained_value, quantity_sent, quantity_returned, quantity_defective",
    )
    .eq("id", id)
    .single();

  if (fetchError || !shipment) {
    return NextResponse.json({ error: "Remessa não encontrada" }, { status: 404 });
  }

  if (shipment.status === "CLOSED") {
    return NextResponse.json({ error: "Remessa já está encerrada" }, { status: 409 });
  }

  const missing: string[] = [];
  if (!["RETURNED", "PARTIALLY_RETURNED"].includes(shipment.status as string)) {
    missing.push("Devolução ainda não foi recebida pelo sistema");
  }
  if (!shipment.reconciliation_status) {
    missing.push("Peças ainda não foram conferidas");
  }
  if ((shipment.payment_status || "PENDING") === "PENDING") {
    missing.push("Valor financeiro ainda não foi lançado");
  }
  if (missing.length > 0) {
    return NextResponse.json(
      { error: "Remessa não pode ser encerrada", missing },
      { status: 422 },
    );
  }

  // Warning (não bloqueia): defeitos aguardando resposta da facção.
  const { count: pendingDefects } = await supabase
    .from("defect_records")
    .select("id", { count: "exact", head: true })
    .eq("shipment_id", id)
    .is("faction_response", null);

  const actorName = actorNameFromUser(user);
  const nowIso = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("faction_shipments")
    .update({
      status: "CLOSED",
      closed_at: nowIso,
      closed_by: actorName,
      status_before_close: shipment.status,
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const released = Math.round(Number(shipment.released_value || 0) * 100) / 100;
  const retained = Math.round(Number(shipment.retained_value || 0) * 100) / 100;

  await logShipmentEvent(supabase, {
    tenantId: shipment.tenant_id as string,
    shipmentId: id,
    eventType: "CLOSED",
    actorType: "ADMIN",
    actorName,
    payload: {
      previous_status: shipment.status,
      released_value: released,
      retained_value: retained,
      pending_defects: pendingDefects ?? 0,
    },
  });

  if (shipment.tenant_id && shipment.faction_id) {
    await notifyFaction(supabase, {
      tenantId: shipment.tenant_id as string,
      factionId: shipment.faction_id as string,
      type: FACTION_NOTIFICATION_TYPES.SHIPMENT_CLOSED,
      title: "Remessa encerrada",
      message: `Remessa encerrada. Valor liberado: ${brl(released)}${retained > 0 ? ` · Retido: ${brl(retained)}` : ""}. Consulte o histórico para o resumo completo.`,
      entityType: "shipment",
      entityId: id,
    });
  }

  return NextResponse.json({
    data: {
      id,
      status: "CLOSED",
      closed_at: nowIso,
      closed_by: actorName,
      warnings:
        (pendingDefects ?? 0) > 0
          ? [`${pendingDefects} defeito(s) ainda sem resposta da facção`]
          : [],
    },
  });
}

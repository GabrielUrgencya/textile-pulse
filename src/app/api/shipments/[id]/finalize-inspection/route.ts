import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";
import { notifyFaction, FACTION_NOTIFICATION_TYPES, brl } from "@/lib/faction-notifications";
import { actorNameFromUser } from "@/lib/shipment-events";

/**
 * PATCH /api/shipments/[id]/finalize-inspection — Frente 3.
 *
 * Fecha a conferência de uma remessa em AWAITING_INSPECTION. Os DEFEITOS já
 * foram registrados ao longo dos dias (/api/defects, vinculados por shipment_id);
 * aqui o admin confirma quantas peças BOAS conferiu, e o servidor:
 *   - soma o defeito dos defect_records desta remessa (não recria defeito);
 *   - calcula faltante = enviado − (boas + defeito);
 *   - libera o pagamento das boas e retém o das defeituosas;
 *   - credita o líquido no ledger da facção.
 *
 * É AQUI que o financeiro fecha — nunca no recebimento físico (hold-inspection).
 * Preço: o da remessa (payment_value ÷ enviado) com fallback ao cadastro.
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
  const countedOk = Number(body?.countedOk);

  if (!Number.isFinite(countedOk) || countedOk < 0) {
    return NextResponse.json(
      { error: "INVALID_COUNT", message: "Informe quantas peças boas foram conferidas" },
      { status: 400 },
    );
  }

  const { data: shipment, error: fetchError } = await supabase
    .from("faction_shipments")
    .select("id, faction_id, lot_id, tenant_id, status, quantity_sent, payment_value")
    .eq("id", id)
    .single();

  if (fetchError || !shipment) {
    return NextResponse.json({ error: "Shipment not found" }, { status: 404 });
  }

  if (shipment.status !== "AWAITING_INSPECTION") {
    return NextResponse.json(
      { error: "INVALID_STATUS", message: "A remessa precisa estar 'Aguardando conferência'" },
      { status: 422 },
    );
  }

  // Defeito = soma dos defect_records registrados durante a conferência (não
  // recriamos defeito aqui; eles já notificaram a facção quando lançados).
  const { data: result, error: reconciliationError } = await supabase.rpc("reconcile_shipment_return_v1", {
    p_shipment_id: id,
    p_expected_status: "AWAITING_INSPECTION",
    p_counted_ok: countedOk,
    p_counted_defect: null,
    p_use_recorded_defects: true,
    p_actor_name: actorNameFromUser(user),
  });
  if (reconciliationError) {
    const message = reconciliationError.message || "Falha ao finalizar a conferÃªncia";
    const status = /OVER_COUNT|INVALID_COUNT/i.test(message) ? 400 : /CONFLICT|STATUS/i.test(message) ? 409 : 500;
    return NextResponse.json({ error: /OVER_COUNT/i.test(message) ? "OVER_COUNT" : "RECONCILIATION_FAILED", message }, { status });
  }
  const settled = (result ?? {}) as {
    status: "RETURNED" | "PARTIALLY_RETURNED";
    reconciliationStatus: "OK" | "SHORTAGE" | "DISCREPANCY";
    shortageQty: number;
    countedOk: number;
    countedDefect: number;
    paymentValue: number;
    releasedValue: number;
    retainedValue: number;
    paymentStatus: "RELEASED" | "PARTIALLY_RELEASED";
  };

  /* Legacy multi-write reconciliation replaced by the atomic RPC.
  const { data: defects } = await supabase
    .from("defect_records")
    .select("quantity")
    .eq("shipment_id", id);
  const countedDefect = (defects || []).reduce((s, d) => s + (Number(d.quantity) || 0), 0);

  const sent = Number(shipment.quantity_sent || 0);
  const returned = countedOk + countedDefect;
  if (returned > sent) {
    return NextResponse.json(
      { error: "OVER_COUNT", message: `Boas (${countedOk}) + defeito (${countedDefect}) maior que o enviado (${sent})` },
      { status: 400 },
    );
  }
  const shortage = Math.max(0, sent - returned);

  const reconciliation: "OK" | "SHORTAGE" | "DISCREPANCY" =
    shortage > 0 ? "SHORTAGE" : "OK";
  const newStatus: "RETURNED" | "PARTIALLY_RETURNED" =
    shortage > 0 || countedDefect > 0 ? "PARTIALLY_RETURNED" : "RETURNED";

  // Preço da remessa (fallback ao cadastro) — mesma regra do /receive.
  const money = (x: number) => Math.round(x * 100) / 100;
  const { data: faction } = await supabase
    .from("factions")
    .select("price_per_piece")
    .eq("id", shipment.faction_id)
    .single();
  const shipmentPrice =
    shipment.payment_value != null && sent > 0 ? Number(shipment.payment_value) / sent : null;
  const pricePerPiece = shipmentPrice != null ? shipmentPrice : Number(faction?.price_per_piece || 0);

  const paymentValue = money(countedOk * pricePerPiece);
  const deductionValue = money(countedDefect * pricePerPiece);
  const releasedValue = paymentValue;
  const retainedValue = deductionValue;
  const paymentStatus = countedDefect > 0 ? "PARTIALLY_RELEASED" : "RELEASED";

  const { error: updateError } = await supabase
    .from("faction_shipments")
    .update({
      status: newStatus,
      quantity_returned: countedOk,
      quantity_defective: countedDefect,
      shortage_qty: shortage,
      reconciliation_status: reconciliation,
      actual_return_at: new Date().toISOString(),
      payment_value: paymentValue,
      deduction_value: deductionValue,
      released_value: releasedValue,
      retained_value: retainedValue,
      payment_status: paymentStatus,
    })
    .eq("id", id);

  if (updateError) return dbError("PATCH /api/shipments/[id]/finalize-inspection", updateError);

  if (shipment.tenant_id) {
    const actorName = actorNameFromUser(user);
    await logShipmentEvent(supabase, {
      tenantId: shipment.tenant_id as string,
      shipmentId: id,
      eventType: "RECONCILED",
      actorType: "ADMIN",
      actorName,
      payload: { ok: countedOk, defective: countedDefect, shortage, reconciliation_status: reconciliation, mode: "inspection_finalized" },
    });
  }

  // Ledger: credita o líquido das boas (trigger mantém factions.current_balance).
  if (releasedValue > 0) {
    try {
      const { error: ledgerError } = await supabase.from("faction_ledger").insert({
        tenant_id: shipment.tenant_id,
        faction_id: shipment.faction_id,
        shipment_id: id,
        entry_type: "PAYMENT",
        amount: releasedValue,
        description: `Conferência finalizada — ${countedOk} peças boas`,
        created_by: user.id,
      });
      if (ledgerError) console.error("[finalize-inspection] faction_ledger:", ledgerError);
    } catch (e) {
      console.error("[finalize-inspection] faction_ledger:", e);
    }
  }

  // Notificações (informativas, não-bloqueantes).
  */
  try {
    const base = { tenantId: shipment.tenant_id as string, factionId: shipment.faction_id as string };
    await notifyFaction(supabase, {
      ...base,
      type: FACTION_NOTIFICATION_TYPES.RETURN_REGISTERED,
      title: "Conferência finalizada",
      message: "A conferência da sua remessa foi finalizada.",
      entityType: "shipment",
      entityId: id,
    });
    if (settled.paymentStatus === "RELEASED" && settled.releasedValue > 0) {
      await notifyFaction(supabase, {
        ...base,
        type: FACTION_NOTIFICATION_TYPES.PAYMENT_RELEASED,
        title: "Pagamento liberado",
        message: `Pagamento de R$ ${brl(settled.releasedValue)} liberado para a remessa.`,
        entityType: "financial",
        entityId: id,
      });
    } else if (settled.paymentStatus === "PARTIALLY_RELEASED") {
      await notifyFaction(supabase, {
        ...base,
        type: FACTION_NOTIFICATION_TYPES.PAYMENT_PARTIAL,
        title: "Pagamento parcial liberado",
        message: `Pagamento parcial: R$ ${brl(settled.releasedValue)}. R$ ${brl(settled.retainedValue)} retidos por defeitos.`,
        entityType: "financial",
        entityId: id,
      });
    }
  } catch (e) {
    console.error("[finalize-inspection] notifications:", e);
  }

  return NextResponse.json({ data: settled });
}

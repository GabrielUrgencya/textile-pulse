import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";
import { dbError } from "@/lib/api-helpers";
import { notifyFaction, FACTION_NOTIFICATION_TYPES, brl } from "@/lib/faction-notifications";
import { logShipmentEvent, actorNameFromUser } from "@/lib/shipment-events";

/**
 * PATCH /api/shipments/[id]/payment — Gestão de pagamento da remessa (admin).
 *
 * Ações:
 *  - release: libera (parte do) valor retido → move de retained_value p/ released_value.
 *  - edit: override manual de released/retained/deduction (com motivo).
 *  - mark-paid / unmark-paid: marca/desmarca como pago.
 *
 * Toda alteração é auditada em metadata.adjustments (append-only). Valores em
 * dinheiro sempre a 2 casas. Multi-tenant via RLS (sessão admin).
 */

const money = (x: number) => Math.round(x * 100) / 100;

type Adjustment = Record<string, unknown>;

function recomputeStatus(released: number, retained: number, paid: boolean): string {
  if (paid) return "PAID";
  if (retained > 0 && released > 0) return "PARTIALLY_RELEASED";
  if (retained > 0 && released === 0) return "PENDING";
  if (released > 0) return "RELEASED";
  return "PENDING";
}

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
  const action: string | undefined = body?.action;

  const { data: shipment, error: fetchError } = await supabase
    .from("faction_shipments")
    .select("id, tenant_id, faction_id, released_value, retained_value, deduction_value, payment_value, payment_status, paid_at, metadata")
    .eq("id", id)
    .single();

  if (fetchError || !shipment) {
    return NextResponse.json({ error: "Shipment not found" }, { status: 404 });
  }

  let released = money(Number(shipment.released_value || 0));
  let retained = money(Number(shipment.retained_value || 0));
  let deduction = money(Number(shipment.deduction_value || 0));
  let paidAt: string | null = shipment.paid_at as string | null;
  const releasedBefore = released;
  // Lançamento no ledger de compensação (definido por ação; inserido após o update).
  let ledgerEntry: { entry_type: string; amount: number; description: string } | null = null;

  const metadata = (shipment.metadata as Record<string, unknown>) || {};
  const adjustments: Adjustment[] = Array.isArray(metadata.adjustments) ? (metadata.adjustments as Adjustment[]) : [];
  const now = new Date().toISOString();

  if (action === "release") {
    const requested = body?.amount != null ? money(Number(body.amount)) : retained;
    if (!Number.isFinite(requested) || requested <= 0) {
      return NextResponse.json({ error: "INVALID_AMOUNT", message: "Valor inválido" }, { status: 400 });
    }
    const amount = Math.min(requested, retained);
    if (amount <= 0) {
      return NextResponse.json({ error: "NOTHING_TO_RELEASE", message: "Nada a liberar" }, { status: 400 });
    }
    retained = money(retained - amount);
    released = money(released + amount);
    adjustments.push({ date: now, type: "RELEASE", amount, by: user.id });
    ledgerEntry = { entry_type: "PAYMENT", amount, description: `Liberação de valor retido — R$ ${amount.toFixed(2)}` };
  } else if (action === "edit") {
    if (body?.releasedValue != null) {
      const v = money(Number(body.releasedValue));
      if (!Number.isFinite(v) || v < 0) return NextResponse.json({ error: "INVALID", message: "Valor liberado inválido" }, { status: 400 });
      released = v;
    }
    if (body?.retainedValue != null) {
      const v = money(Number(body.retainedValue));
      if (!Number.isFinite(v) || v < 0) return NextResponse.json({ error: "INVALID", message: "Valor retido inválido" }, { status: 400 });
      retained = v;
    }
    if (body?.deductionValue != null) {
      const v = money(Number(body.deductionValue));
      if (!Number.isFinite(v) || v < 0) return NextResponse.json({ error: "INVALID", message: "Dedução inválida" }, { status: 400 });
      deduction = v;
    }
    adjustments.push({
      date: now, type: "EDIT", reason: body?.reason || null, by: user.id,
      to: { released, retained, deduction },
    });
    const delta = money(released - releasedBefore);
    if (delta !== 0) {
      ledgerEntry = {
        entry_type: "ADJUSTMENT",
        amount: delta,
        description: `Ajuste manual do valor liberado${body?.reason ? ` — ${body.reason}` : ""}`,
      };
    }
  } else if (action === "mark-paid") {
    if (released <= 0) {
      return NextResponse.json({ error: "NO_VALUE", message: "Não há valor liberado para pagar" }, { status: 400 });
    }
    if (shipment.payment_status === "PAID") {
      return NextResponse.json({ error: "ALREADY_PAID", message: "Já está pago" }, { status: 409 });
    }
    paidAt = now;
    adjustments.push({ date: now, type: "PAID", amount: released, by: user.id });
    ledgerEntry = { entry_type: "COMPENSATION", amount: -released, description: `Pagamento efetuado — R$ ${released.toFixed(2)}` };
  } else if (action === "unmark-paid") {
    paidAt = null;
    adjustments.push({ date: now, type: "UNPAID", by: user.id });
    ledgerEntry = { entry_type: "COMPENSATION", amount: released, description: "Reversão de pagamento" };
  } else {
    return NextResponse.json({ error: "INVALID_ACTION", message: "Ação inválida" }, { status: 400 });
  }

  const paymentStatus = recomputeStatus(released, retained, paidAt != null);

  const { error: updateError } = await supabase
    .from("faction_shipments")
    .update({
      released_value: released,
      retained_value: retained,
      deduction_value: deduction,
      payment_status: paymentStatus,
      paid_at: paidAt,
      metadata: { ...metadata, adjustments },
    })
    .eq("id", id);

  if (updateError) return dbError("PATCH /api/shipments/[id]/payment", updateError);

  // Timeline (épico Robustez F2) — best-effort.
  if (shipment.tenant_id) {
    await logShipmentEvent(supabase, {
      tenantId: shipment.tenant_id as string,
      shipmentId: id,
      eventType: "PAYMENT",
      actorType: "ADMIN",
      actorName: actorNameFromUser(user),
      payload: { action, released, retained, deduction, payment_status: paymentStatus },
    });
  }

  // Ledger de compensação (trigger mantém factions.current_balance). Não-bloqueante.
  if (ledgerEntry) {
    try {
      const { error: ledgerError } = await supabase.from("faction_ledger").insert({
        tenant_id: shipment.tenant_id,
        faction_id: shipment.faction_id,
        shipment_id: id,
        entry_type: ledgerEntry.entry_type,
        amount: ledgerEntry.amount,
        description: ledgerEntry.description,
        created_by: user.id,
      });
      if (ledgerError) console.error("[payment] faction_ledger:", ledgerError);
    } catch (e) {
      console.error("[payment] faction_ledger:", e);
    }
  }

  // Notificação: liberação manual de valor retido.
  if (action === "release" && ledgerEntry) {
    await notifyFaction(supabase, {
      tenantId: shipment.tenant_id as string,
      factionId: shipment.faction_id as string,
      type: FACTION_NOTIFICATION_TYPES.PAYMENT_RELEASED,
      title: "Pagamento liberado",
      message: `Pagamento de R$ ${brl(ledgerEntry.amount)} liberado para a remessa.`,
      entityType: "financial",
      entityId: id,
    });
  }

  return NextResponse.json({
    data: {
      releasedValue: released,
      retainedValue: retained,
      deductionValue: deduction,
      paymentStatus,
      paidAt,
    },
  });
}

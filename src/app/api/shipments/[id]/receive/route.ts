import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";
import { dbError } from "@/lib/api-helpers";
import { validateDeliveryCode } from "@/lib/delivery-code";
import { notifyFaction, FACTION_NOTIFICATION_TYPES, brl } from "@/lib/faction-notifications";
import { logShipmentEvent, actorNameFromUser } from "@/lib/shipment-events";

const VALID_DEFECT_TYPES = ["COSTURA", "TECIDO", "AVIAMENTO", "OUTRO"];
const VALID_SEVERITIES = ["LEVE", "MEDIO", "GRAVE"];

/**
 * PATCH /api/shipments/[id]/receive
 * Devolução Híbrida A+B — passo 2 (conferência CEGA na fábrica).
 *
 * A fábrica digita o CÓDIGO DE DEVOLUÇÃO (que o motorista trouxe da facção) e
 * conta as peças boas/defeituosas SEM ver a declaração. O servidor reconcilia
 * contra a declaração e decide o status + libera/trava o pagamento.
 *
 * Só opera sobre remessas em RETURN_DECLARED. Nunca grava "RECEIVED" (valor
 * inexistente no enum ShipmentStatus — bug antigo corrigido aqui).
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
  const countedOk = Number(body?.countedOk);
  const countedDefect = Number(body?.countedDefect);
  const defectType: string | undefined = body?.defectType;
  const severity: string | undefined = body?.severity;
  const defectDescription: string | undefined = body?.defectDescription;

  if (!Number.isFinite(countedOk) || !Number.isFinite(countedDefect) || countedOk < 0 || countedDefect < 0) {
    return NextResponse.json(
      { error: "INVALID_COUNT", message: "Contagem inválida" },
      { status: 400 },
    );
  }

  // Se há peças com defeito, tipo + severidade são obrigatórios (alimenta o
  // sistema de defeitos e o portal da facção).
  if (countedDefect > 0) {
    if (!defectType || !VALID_DEFECT_TYPES.includes(defectType)) {
      return NextResponse.json(
        { error: "DEFECT_TYPE_REQUIRED", message: "Informe o tipo do defeito" },
        { status: 400 },
      );
    }
    if (!severity || !VALID_SEVERITIES.includes(severity)) {
      return NextResponse.json(
        { error: "SEVERITY_REQUIRED", message: "Informe a severidade do defeito" },
        { status: 400 },
      );
    }
  }

  // Busca a remessa + campos de devolução
  const { data: shipment, error: fetchError } = await supabase
    .from("faction_shipments")
    .select(
      "id, faction_id, lot_id, tenant_id, status, quantity_sent, declared_ok, declared_defect, return_code, return_code_expires_at, return_code_attempts",
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
        message: "A remessa precisa estar em 'Devolução declarada' para conferir",
      },
      { status: 422 },
    );
  }

  // Valida o código de devolução (reusa a lógica do código de entrega, mapeando campos)
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

  // Reconciliação (server-side, contagem cega já feita)
  const sent = Number(shipment.quantity_sent || 0);
  const declaredOk = shipment.declared_ok ?? 0;
  const declaredDefect = shipment.declared_defect ?? 0;
  const returned = countedOk + countedDefect;
  const shortage = Math.max(0, sent - returned);

  if (returned > sent) {
    return NextResponse.json(
      { error: "OVER_COUNT", message: `Contagem (${returned}) maior que o enviado (${sent})` },
      { status: 400 },
    );
  }

  let reconciliation: "OK" | "SHORTAGE" | "DISCREPANCY";
  let newStatus: "RETURNED" | "PARTIALLY_RETURNED";
  if (shortage > 0) {
    reconciliation = "SHORTAGE";
    newStatus = "PARTIALLY_RETURNED";
  } else if (countedOk !== declaredOk || countedDefect !== declaredDefect) {
    // Total bate, mas a divisão boas/defeito difere do declarado
    reconciliation = "DISCREPANCY";
    newStatus = "PARTIALLY_RETURNED";
  } else {
    reconciliation = "OK";
    newStatus = "RETURNED";
  }

  // Pagamento (liberação parcial): paga-se pelas peças BOAS conferidas.
  // released = boas×preço (auto-liberado); retained = defeito×preço (retido até
  // resolução). Sempre 2 casas.
  const money = (x: number) => Math.round(x * 100) / 100;
  const { data: faction } = await supabase
    .from("factions")
    .select("price_per_piece")
    .eq("id", shipment.faction_id)
    .single();
  const pricePerPiece = Number(faction?.price_per_piece || 0);
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
      return_code_attempts: 0,
    })
    .eq("id", id);

  if (updateError) return dbError("PATCH /api/shipments/[id]/receive", updateError);

  // Timeline (épico Robustez F2) — best-effort.
  if (shipment.tenant_id) {
    const actorName = actorNameFromUser(user);
    await logShipmentEvent(supabase, {
      tenantId: shipment.tenant_id as string,
      shipmentId: id,
      eventType: "RECEIVED",
      actorType: "ADMIN",
      actorName,
      payload: { status: newStatus },
    });
    await logShipmentEvent(supabase, {
      tenantId: shipment.tenant_id as string,
      shipmentId: id,
      eventType: "RECONCILED",
      actorType: "ADMIN",
      actorName,
      payload: {
        ok: countedOk,
        defective: countedDefect,
        shortage,
        reconciliation_status: reconciliation,
      },
    });
  }

  // Ledger de compensação: credita o valor liberado (líquido das boas) no saldo
  // da facção. Trigger do banco mantém factions.current_balance. Não-bloqueante.
  if (releasedValue > 0) {
    try {
      const { error: ledgerError } = await supabase.from("faction_ledger").insert({
        tenant_id: shipment.tenant_id,
        faction_id: shipment.faction_id,
        shipment_id: id,
        entry_type: "PAYMENT",
        amount: releasedValue,
        description: `Conferência da devolução — ${countedOk} peças boas`,
        created_by: user.id,
      });
      if (ledgerError) console.error("[receive] faction_ledger:", ledgerError);
    } catch (e) {
      console.error("[receive] faction_ledger:", e);
    }
  }

  // Notificações estratégicas da conferência (informativas, não-bloqueantes).
  try {
    const base = { tenantId: shipment.tenant_id as string, factionId: shipment.faction_id as string };
    await notifyFaction(supabase, {
      ...base,
      type: FACTION_NOTIFICATION_TYPES.RETURN_REGISTERED,
      title: "Devolução registrada",
      message: "A devolução da sua remessa foi registrada no sistema.",
      entityType: "shipment",
      entityId: id,
    });
    if (reconciliation === "OK") {
      await notifyFaction(supabase, {
        ...base,
        type: FACTION_NOTIFICATION_TYPES.SHIPMENT_APPROVED,
        title: "Remessa aprovada",
        message: "Sua remessa foi aprovada na conferência.",
        entityType: "shipment",
        entityId: id,
      });
    } else {
      await notifyFaction(supabase, {
        ...base,
        type: FACTION_NOTIFICATION_TYPES.SHIPMENT_REJECTED,
        title: "Divergência na conferência",
        message: "Remessa com divergência na conferência. Verifique os detalhes.",
        severity: "WARNING",
        entityType: "shipment",
        entityId: id,
      });
    }
    if (countedDefect > 0 && deductionValue > 0) {
      await notifyFaction(supabase, {
        ...base,
        type: FACTION_NOTIFICATION_TYPES.DEDUCTION_APPLIED,
        title: "Dedução aplicada",
        message: `Dedução de R$ ${brl(deductionValue)} aplicada à remessa por peças com defeito.`,
        severity: "WARNING",
        entityType: "financial",
        entityId: id,
      });
    }
    if (paymentStatus === "RELEASED" && releasedValue > 0) {
      await notifyFaction(supabase, {
        ...base,
        type: FACTION_NOTIFICATION_TYPES.PAYMENT_RELEASED,
        title: "Pagamento liberado",
        message: `Pagamento de R$ ${brl(releasedValue)} liberado para a remessa.`,
        entityType: "financial",
        entityId: id,
      });
    } else if (paymentStatus === "PARTIALLY_RELEASED") {
      await notifyFaction(supabase, {
        ...base,
        type: FACTION_NOTIFICATION_TYPES.PAYMENT_PARTIAL,
        title: "Pagamento parcial liberado",
        message: `Pagamento parcial liberado: R$ ${brl(releasedValue)}. R$ ${brl(retainedValue)} retidos por defeitos em análise.`,
        entityType: "financial",
        entityId: id,
      });
    }
    // Saldo negativo → a compensar (1x por dia via dedupe)
    const { data: facBal } = await supabase
      .from("factions")
      .select("current_balance")
      .eq("id", shipment.faction_id)
      .single();
    const bal = Number(facBal?.current_balance || 0);
    if (bal < 0) {
      const day = new Date().toISOString().slice(0, 10);
      await notifyFaction(supabase, {
        ...base,
        type: FACTION_NOTIFICATION_TYPES.BALANCE_NEGATIVE,
        title: "Saldo a compensar",
        message: `Você possui R$ ${brl(bal)} a compensar na próxima remessa.`,
        severity: "WARNING",
        entityType: "financial",
        dedupeKey: `BALANCE_NEG:${shipment.faction_id}:${day}`,
      });
    }
  } catch (e) {
    console.error("[receive] notifications:", e);
  }

  // Peças com defeito → cria defect_record vinculado à remessa (shipment_id),
  // que aparece no portal da facção e habilita resposta/contestação. Falha aqui
  // NÃO reverte a conferência (a remessa já foi conferida).
  let defectRecorded = false;
  if (countedDefect > 0 && shipment.lot_id) {
    try {
      const { error: defectError } = await supabase.from("defect_records").insert({
        lot_id: shipment.lot_id,
        shipment_id: id,
        quantity: countedDefect,
        defect_type: defectType,
        severity,
        description: defectDescription || null,
        detected_by: user.id,
        status: "PENDING",
      });

      if (defectError) {
        console.error("[receive] defect_record insert:", defectError);
      } else {
        defectRecorded = true;
        // Peças defeituosas vão para retrabalho.
        await supabase.from("lots").update({ status: "IN_REWORK" }).eq("id", shipment.lot_id);

        // Notifica a facção (padrão do /api/defects, não-bloqueante).
        try {
          const { data: fac } = await supabase
            .from("factions")
            .select("tenant_id")
            .eq("id", shipment.faction_id)
            .single();
          const tenantId = fac?.tenant_id;
          if (tenantId) {
            const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
            const { data: existing } = await supabase
              .from("notifications")
              .select("id")
              .eq("tenant_id", tenantId)
              .eq("type", "DEFECT_DETECTED")
              .eq("faction_id", shipment.faction_id)
              .is("read_at", null)
              .gte("created_at", fourHoursAgo)
              .limit(1);
            if (!existing || existing.length === 0) {
              await supabase.from("notifications").insert({
                tenant_id: tenantId,
                faction_id: shipment.faction_id,
                type: "DEFECT_DETECTED",
                audience: "FACTION",
                title: `Defeito na devolução — Lote ${String(shipment.lot_id).slice(0, 8)}`,
                message: `${countedDefect} peça(s) com defeito de ${defectType}. Severidade: ${severity}.`,
                severity: severity === "GRAVE" ? "CRITICAL" : "WARNING",
              });
            }
          }
        } catch {
          // Notificação não-bloqueante
        }
      }
    } catch (e) {
      console.error("[receive] defect flow error:", e);
    }
  }

  return NextResponse.json({
    data: {
      status: newStatus,
      reconciliationStatus: reconciliation,
      shortageQty: shortage,
      declaredOk,
      declaredDefect,
      countedOk,
      countedDefect,
      paymentValue,
      releasedValue,
      retainedValue,
      paymentStatus,
      defectRecorded,
    },
  });
}

import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";
import { dbError, requireTenantId } from "@/lib/api-helpers";
import { generateUniqueDeliveryCode } from "@/lib/delivery-code";
import { notifyFaction, FACTION_NOTIFICATION_TYPES } from "@/lib/faction-notifications";
import { validateLotsEligibility } from "@/lib/production-orders";
import { localDayEnd, TENANT_TZ } from "@/lib/tz";

export async function GET(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;

  if (!can(user, "factions:view")) {
    return NextResponse.json({ error: "Forbidden: factions:view required" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const factionId = searchParams.get("faction_id");
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("faction_shipments")
    .select(`
      id, faction_id, status, quantity_sent, quantity_returned, quantity_defective,
      sent_at, actual_return_at, expected_return_at, payment_value, deduction_value,
      notes, created_at,
      factions ( id, name )
    `, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status) query = query.eq("status", status);
  if (factionId) query = query.eq("faction_id", factionId);

  const { data: shipments, error, count } = await query;

  if (error) return dbError("GET /api/shipments", error);

  // Story 8.14 (AC8): dias restantes / atraso ate o prazo de retorno da faccao
  const MS_PER_DAY = 86_400_000;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const enriched = (shipments || []).map((s) => {
    const rec = s as Record<string, unknown>;
    const expected = rec.expected_return_at as string | null;
    const settled = rec.actual_return_at != null;
    let daysRemaining: number | null = null;
    let isOverdue = false;
    if (expected && !settled) {
      const due = new Date(expected);
      due.setHours(0, 0, 0, 0);
      daysRemaining = Math.round((due.getTime() - startOfToday.getTime()) / MS_PER_DAY);
      isOverdue = daysRemaining < 0;
    }
    return { ...s, days_remaining: daysRemaining, is_overdue: isOverdue };
  });

  return NextResponse.json({
    data: enriched,
    pagination: {
      page,
      limit,
      total: count || 0,
      pages: Math.ceil((count || 0) / limit),
    },
  });
}

export async function POST(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;

  if (!can(user, "factions:manage")) {
    return NextResponse.json({ error: "Forbidden: factions:manage required" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);

  if (!body?.factionId || !body?.lotIds?.length || !body?.expectedReturn) {
    return NextResponse.json(
      { error: "factionId, lotIds, and expectedReturn are required" },
      { status: 400 },
    );
  }

  const t = requireTenantId(user);
  if (t.error) return t.error;

  if (!Array.isArray(body.lotIds) || body.lotIds.some((id: unknown) => typeof id !== "string" || !id)) {
    return NextResponse.json({ error: "lotIds deve conter identificadores vÃ¡lidos" }, { status: 400 });
  }
  if (new Set(body.lotIds).size !== body.lotIds.length) {
    return NextResponse.json({ error: "lotIds nÃ£o pode conter lotes duplicados" }, { status: 400 });
  }
  const lotIds = body.lotIds as string[];

  // Frente 2: preço por peça definido na remessa (sobrescreve o cadastro).
  // Ausente/negativo/NaN → null: cai no fallback de factions.price_per_piece no
  // recebimento. money = 2 casas para bater com o resto do financeiro.
  const rawPrice = Number(body.pricePerPiece);
  const pricePerPiece = Number.isFinite(rawPrice) && rawPrice >= 0 ? rawPrice : null;

  // Frente 1: agrupar as remessas deste envio sob um group_id + UM código
  // compartilhado (a facção lida com um único código para o conjunto). Só faz
  // sentido com 2+ lotes; com 1 lote é idêntico ao individual. grouped=false
  // (ou ausente) preserva o comportamento atual (um código por lote).
  const grouped = body.grouped === true && lotIds.length > 1;

  // Quantidades dos lotes (escopo garantido: só lotes de OPs do tenant).
  // F1 barreira 2: status/op_number para revalidar elegibilidade no submit —
  // não confiar no filtro do frontend.
  const { data: pos, error: poErr } = await supabase
    .from("production_orders")
    .select("id, status, op_number")
    .eq("tenant_id", t.tenantId);
  if (poErr) return dbError("POST /api/shipments (pos)", poErr);
  const poIds = (pos || []).map((p) => p.id as string);
  const posById = new Map(
    (pos || []).map((p) => [p.id as string, { status: p.status as string, op_number: p.op_number as string | null }]),
  );

  const { data: lots, error: lotsErr } = await supabase
    .from("lots")
    .select("id, quantity, po_id")
    .in("id", lotIds)
    .in("po_id", poIds);
  if (lotsErr) return dbError("POST /api/shipments (lots)", lotsErr);

  if (!lots || lots.length !== lotIds.length) {
    return NextResponse.json(
      { error: "Um ou mais lotes não foram encontrados neste tenant" },
      { status: 400 },
    );
  }

  // F1: qualquer lote de OP inelegível (CANCELLED/COMPLETED) rejeita a
  // remessa INTEIRA antes de criar qualquer linha.
  const rejection = validateLotsEligibility(
    lots as Array<{ id: string; po_id: string }>,
    posById,
  );
  if (rejection) {
    return NextResponse.json({ error: rejection }, { status: 422 });
  }

  // Modelo canônico: 1 remessa = 1 lote (portal/financeiro/devoluções leem por
  // lote). Uma "remessa" com N lotes vira N linhas — cada sublote (fracionamento
  // por cor) é um lot com barcode próprio, então preto→facção A e branco→facção B
  // são remessas distintas. Cada linha recebe seu delivery_code único.
  // Frente 1: quando agrupado, gera UM código compartilhado antes do laço e o
  // replica em todas as remessas do grupo (a facção recebe/devolve o conjunto
  // com um só código). Se a geração falhar, o grupo procede sem código (a
  // devolução tem o caminho manual, como no fluxo individual).
  let sharedCode: string | null = null;
  let sharedCodeExpiresAt: string | null = null;
  if (grouped) {
    try {
      const dc = await generateUniqueDeliveryCode(supabase);
      sharedCode = dc.code;
      sharedCodeExpiresAt = dc.expiresAt;
    } catch {
      // Non-blocking
    }
  }

  const deliveryCodes: Array<string | null> = [];
  const deliveryExpiryTimestamps: Array<string | null> = [];
  for (let index = 0; index < lots.length; index += 1) {
    let deliveryCode: string | null = sharedCode;
    let deliveryCodeExpiresAt: string | null = sharedCodeExpiresAt;
    if (!grouped) {
      try {
        const dc = await generateUniqueDeliveryCode(supabase);
        deliveryCode = dc.code;
        deliveryCodeExpiresAt = dc.expiresAt;
      } catch {
        // Non-blocking: remessa procede sem código de entrega
      }
    }
    deliveryCodes.push(deliveryCode);
    deliveryExpiryTimestamps.push(deliveryCodeExpiresAt);
    /* rows.push({
      tenant_id: t.tenantId,
      faction_id: body.factionId,
      lot_id: lot.id,
      status: "SENT",
      quantity_sent: lot.quantity || 0,
      // Frente 1: id do grupo (null = remessa individual).
      shipment_group_id: groupId,
      // Frente 2: valor da remessa = preço × quantidade. null quando não há
      // preço informado → o recebimento usa o preço do cadastro (fallback).
      payment_value: pricePerPiece != null ? money(pricePerPiece * qty) : null,
      // Registro COMPLETO: o admin (/api/factions/[id]) lê total_quantity e
      // expected_return (sem _at); o portal lê quantity_sent e expected_return_at.
      // Gravamos ambos (1 lote → total_quantity == quantity_sent) para todos os
      // leitores funcionarem.
      total_quantity: qty,
      sent_at: sentAt,
      // Fix fuso: a data escolhida (YYYY-MM-DD) vira FIM do dia no fuso do tenant.
      // Sem isso, a string crua era interpretada como meia-noite UTC = dia anterior em BRT.
      // Ambas as colunas são timestamptz (schema), então ambas recebem o timestamp local.
      expected_return_at: localDayEnd(String(body.expectedReturn).slice(0, 10)),
      expected_return: localDayEnd(String(body.expectedReturn).slice(0, 10)),
      notes: body.notes || null,
      delivery_code: deliveryCode,
      delivery_code_expires_at: deliveryCodeExpiresAt,
    }); */
  }

  const actorName =
    (user as { profile?: { full_name?: string | null } }).profile?.full_name ??
    (user as { email?: string | null }).email ??
    null;
  const { data: result, error } = await supabase.rpc("create_faction_shipments_atomic_v1", {
    p_faction_id: body.factionId,
    p_lot_ids: lotIds,
    p_expected_return: localDayEnd(String(body.expectedReturn).slice(0, 10)),
    p_price_per_piece: pricePerPiece,
    p_notes: body.notes || null,
    p_grouped: grouped,
    p_delivery_codes: deliveryCodes,
    p_delivery_code_expires_at: deliveryExpiryTimestamps,
    p_actor_name: actorName,
  });
  if (error) {
    const message = error.message || "Falha ao criar remessa";
    const status = /LOT_ALREADY_IN_ACTIVE_SHIPMENT|SHIPMENT_STATUS_CONFLICT/i.test(message) ? 409 :
      /LOT_PO_NOT_ELIGIBLE|LOT_NOT_FOUND|FACTION_NOT_FOUND|INVALID_/i.test(message) ? 422 : 500;
    return NextResponse.json({ error: message }, { status });
  }
  const created = Array.isArray((result as { shipments?: unknown[] } | null)?.shipments)
    ? (result as { shipments: Array<{ id: string; lot_id: string; delivery_code: string | null }> }).shipments
    : [];

  // Junção shipment_lots: o /api/factions/[id] liga defeitos aos lotes por aqui.
  // 1 remessa = 1 lote, então cada remessa gera 1 linha na junção.
  if (created && created.length > 0) {
    /* Atomic RPC already writes shipment_lots, CREATED events and the audit row.
    const junction = created.map((s) => {
      const lot = lots.find((l) => l.id === (s.lot_id as string));
      return { shipment_id: s.id, lot_id: s.lot_id, quantity: lot?.quantity || 0 };
    });
    const { error: junctionError } = await supabase.from("shipment_lots").insert(junction);
    if (junctionError) {
      // Não bloqueia a remessa (já criada), mas registra para diagnóstico.
      console.error("POST /api/shipments (shipment_lots):", junctionError);
    }

    // Timeline (F3): evento CREATED por remessa — best-effort.
    const actorName =
      (user as { profile?: { full_name?: string | null } }).profile?.full_name ??
      (user as { email?: string | null }).email ??
      null;
    const events = created.map((s) => {
      const lot = lots.find((l) => l.id === (s.lot_id as string));
      return {
        tenant_id: t.tenantId,
        shipment_id: s.id as string,
        event_type: "CREATED",
        actor_type: "ADMIN",
        actor_name: actorName,
        visible_to_faction: true,
        payload: { quantity: lot?.quantity || 0, faction_id: body.factionId },
      };
    });
    const { error: eventsError } = await supabase.from("shipment_events").insert(events);
    if (eventsError) {
      console.error("POST /api/shipments (shipment_events):", eventsError);
    }

    // Notificação estratégica: nova remessa disponível para a facção.
    */
    const prazo = new Date(localDayEnd(String(body.expectedReturn).slice(0, 10))).toLocaleDateString("pt-BR", { timeZone: TENANT_TZ });
    for (const s of created) {
      const lot = lots.find((l) => l.id === (s.lot_id as string));
      await notifyFaction(supabase, {
        tenantId: t.tenantId,
        factionId: body.factionId,
        type: FACTION_NOTIFICATION_TYPES.SHIPMENT_NEW,
        title: "Nova remessa disponível",
        message: `Nova remessa disponível: ${lot?.quantity || 0} peças. Prazo: ${prazo}.`,
        entityType: "shipment",
        entityId: s.id as string,
      });
    }
  }

  return NextResponse.json(
    { data: { shipments: created, count: created.length, shipment_group_id: (result as { shipment_group_id?: string | null } | null)?.shipment_group_id ?? null } },
    { status: 201 },
  );
}

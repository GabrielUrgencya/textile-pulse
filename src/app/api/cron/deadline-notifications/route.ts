import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { notifyFaction, FACTION_NOTIFICATION_TYPES } from "@/lib/faction-notifications";

/**
 * GET /api/cron/deadline-notifications — Notificações estratégicas agendadas.
 * Épico Portal da Facção, Frente 2. Protegido por x-cron-secret.
 *
 * Varre diariamente:
 *  - Prazos de entrega (7/3/1 dias e vencido) das remessas ativas.
 *  - Peças com defeito pendentes (retirada em 3 dias / não retirada em 7).
 * Dedupe determinístico via dedupe_key — rodar N vezes não duplica.
 */

const ACTIVE_STATUSES = ["SENT", "RECEIVED_BY_FACTION", "RETURN_DECLARED"];

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

export async function GET(request: Request) {
  // Aceita x-cron-secret (disparo manual/externo) ou Authorization Bearer
  // (formato que o Vercel Cron envia automaticamente com CRON_SECRET).
  const headerSecret = request.headers.get("x-cron-secret");
  const bearer = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  const authorized =
    !!expected && (headerSecret === expected || bearer === `Bearer ${expected}`);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let created = 0;

  // ── Grupo 1: prazos de entrega ──────────────────────────────────────────
  const { data: shipments, error: shipErr } = await supabaseAdmin
    .from("faction_shipments")
    .select("id, faction_id, tenant_id, status, expected_return_at")
    .in("status", ACTIVE_STATUSES)
    .not("expected_return_at", "is", null);

  if (shipErr) {
    return NextResponse.json({ error: shipErr.message }, { status: 500 });
  }

  for (const s of shipments || []) {
    const d = daysUntil(s.expected_return_at as string);
    let type: string | null = null;
    let title = "";
    let message = "";
    let severity: "INFO" | "WARNING" | "CRITICAL" = "INFO";

    if (d === 7) {
      type = FACTION_NOTIFICATION_TYPES.DEADLINE_7D;
      title = "Prazo em 7 dias";
      message = "Sua remessa vence em 7 dias. Organize a entrega.";
    } else if (d === 3) {
      type = FACTION_NOTIFICATION_TYPES.DEADLINE_3D;
      title = "Prazo em 3 dias";
      message = "Atenção: 3 dias para o prazo de entrega.";
      severity = "WARNING";
    } else if (d === 1) {
      type = FACTION_NOTIFICATION_TYPES.DEADLINE_1D;
      title = "Último dia";
      message = "Último dia para entrega da remessa.";
      severity = "WARNING";
    } else if (d <= -1) {
      type = FACTION_NOTIFICATION_TYPES.DEADLINE_OVERDUE;
      title = "Remessa atrasada";
      message = "Sua remessa está atrasada. Entre em contato.";
      severity = "CRITICAL";
    }

    if (type) {
      const ok = await notifyFaction(supabaseAdmin, {
        tenantId: s.tenant_id as string,
        factionId: s.faction_id as string,
        type,
        title,
        message,
        severity,
        entityType: "shipment",
        entityId: s.id as string,
        dedupeKey: `${type}:shipment:${s.id}`,
      });
      if (ok) created++;
    }
  }

  // ── Grupo 2: peças com defeito pendentes (retirada) ────────────────────
  const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const { data: defects, error: defErr } = await supabaseAdmin
    .from("defect_records")
    .select("id, detected_at, shipment_id, faction_shipments!inner(faction_id, tenant_id)")
    .eq("status", "PENDING")
    .not("shipment_id", "is", null)
    .lte("detected_at", threeDaysAgo);

  if (defErr) {
    return NextResponse.json({ error: defErr.message, createdSoFar: created }, { status: 500 });
  }

  for (const rec of defects || []) {
    const shipRel = rec.faction_shipments as unknown;
    const ship = (Array.isArray(shipRel) ? shipRel[0] : shipRel) as
      | { faction_id: string; tenant_id: string }
      | null;
    if (!ship) continue;

    const isNotPicked = (rec.detected_at as string) <= sevenDaysAgo;
    const type = isNotPicked
      ? FACTION_NOTIFICATION_TYPES.RETURN_NOT_PICKED
      : FACTION_NOTIFICATION_TYPES.RETURN_PICKUP_3D;

    const ok = await notifyFaction(supabaseAdmin, {
      tenantId: ship.tenant_id,
      factionId: ship.faction_id,
      type,
      title: isNotPicked ? "Peças não retiradas" : "Retirada pendente",
      message: isNotPicked
        ? "Peças com defeito não retiradas no prazo. Contate o admin."
        : "Retire/resolva as peças com defeito em até 3 dias.",
      severity: isNotPicked ? "CRITICAL" : "WARNING",
      entityType: "defect",
      entityId: rec.id as string,
      dedupeKey: `${type}:defect:${rec.id}`,
    });
    if (ok) created++;
  }

  return NextResponse.json({ ok: true, created });
}

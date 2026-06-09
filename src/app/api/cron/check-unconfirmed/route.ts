import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * GET /api/cron/check-unconfirmed — Check for unconfirmed shipments
 * Story 8.8 — AC1, AC2, AC3, AC4
 * Protected with x-cron-secret header
 */
export async function GET(request: Request) {
  const cronSecret = request.headers.get("x-cron-secret");
  if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

  // Find shipments that are SENT, not confirmed, and sent more than 4h ago
  const { data: unconfirmed, error } = await supabaseAdmin
    .from("faction_shipments")
    .select("id, tenant_id, sent_by, faction_id, sent_at, factions(name)")
    .eq("status", "SENT")
    .is("faction_confirmed_at", null)
    .lt("sent_at", fourHoursAgo);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let created = 0;
  let skipped = 0;

  for (const shipment of unconfirmed || []) {
    // Check for existing notification in last 4h to avoid duplicates (AC2)
    const { data: existing } = await supabaseAdmin
      .from("notifications")
      .select("id")
      .eq("tenant_id", shipment.tenant_id)
      .eq("type", "UNCONFIRMED_SHIPMENT")
      .like("message", `%${shipment.id}%`)
      .gte("created_at", fourHoursAgo)
      .limit(1);

    if (existing && existing.length > 0) {
      skipped++;
      continue;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const factionName = (shipment.factions as any)?.name || "Facção";
    const hoursSince = Math.round(
      (Date.now() - new Date(shipment.sent_at).getTime()) / (1000 * 60 * 60)
    );

    const title = `Remessa sem confirmação — ${factionName}`;
    const message = `Remessa ${shipment.id} enviada há ${hoursSince}h sem confirmação de recebimento pela facção.`;

    // Create notification for the sender (sent_by)
    if (shipment.sent_by) {
      await supabaseAdmin.from("notifications").insert({
        tenant_id: shipment.tenant_id,
        user_id: shipment.sent_by,
        type: "UNCONFIRMED_SHIPMENT",
        title,
        message,
        severity: "WARNING",
      });
      created++;
    }

    // Create notification for GERENTE role
    await supabaseAdmin.from("notifications").insert({
      tenant_id: shipment.tenant_id,
      target_role: "GERENTE",
      type: "UNCONFIRMED_SHIPMENT",
      title,
      message,
      severity: "WARNING",
    });
    created++;
  }

  return NextResponse.json({
    data: {
      checked: (unconfirmed || []).length,
      created,
      skipped,
    },
  });
}

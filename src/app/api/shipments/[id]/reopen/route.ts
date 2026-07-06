import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";
import { notifyFaction, FACTION_NOTIFICATION_TYPES } from "@/lib/faction-notifications";
import { logShipmentEvent, actorNameFromUser } from "@/lib/shipment-events";

/**
 * POST /api/shipments/[id]/reopen — Reabre remessa encerrada (épico Robustez F2).
 * Apenas admin; só para status CLOSED. Restaura o status anterior ao
 * encerramento (fallback RETURNED) e registra REOPENED na timeline.
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
    .select("id, tenant_id, faction_id, status, status_before_close")
    .eq("id", id)
    .single();

  if (fetchError || !shipment) {
    return NextResponse.json({ error: "Remessa não encontrada" }, { status: 404 });
  }

  if (shipment.status !== "CLOSED") {
    return NextResponse.json(
      { error: "Apenas remessas encerradas podem ser reabertas" },
      { status: 422 },
    );
  }

  const restoredStatus = (shipment.status_before_close as string) || "RETURNED";
  const actorName = actorNameFromUser(user);

  const { error: updateError } = await supabase
    .from("faction_shipments")
    .update({
      status: restoredStatus,
      closed_at: null,
      closed_by: null,
      status_before_close: null,
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await logShipmentEvent(supabase, {
    tenantId: shipment.tenant_id as string,
    shipmentId: id,
    eventType: "REOPENED",
    actorType: "ADMIN",
    actorName,
    payload: { restored_status: restoredStatus },
  });

  if (shipment.tenant_id && shipment.faction_id) {
    await notifyFaction(supabase, {
      tenantId: shipment.tenant_id as string,
      factionId: shipment.faction_id as string,
      type: FACTION_NOTIFICATION_TYPES.SHIPMENT_REOPENED,
      title: "Remessa reaberta",
      message: "Uma remessa encerrada foi reaberta pela fábrica para revisão.",
      entityType: "shipment",
      entityId: id,
    });
  }

  return NextResponse.json({ data: { id, status: restoredStatus } });
}

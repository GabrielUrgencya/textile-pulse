import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";
import { actorNameFromUser } from "@/lib/shipment-events";

/**
 * POST /api/shipments/[id]/notes — Observação na remessa (épico Robustez F3).
 * Observação = shipment_events NOTE; visible_to_faction controla exposição no
 * portal. Persiste mesmo após encerramento (eventos nunca são apagados).
 */
export async function POST(
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
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const visibleToFaction = body?.visibleToFaction !== false;

  if (!text) {
    return NextResponse.json({ error: "Texto da observação é obrigatório" }, { status: 400 });
  }
  if (text.length > 2000) {
    return NextResponse.json({ error: "Observação muito longa (máx. 2000 caracteres)" }, { status: 400 });
  }

  const { data: shipment, error: fetchError } = await supabase
    .from("faction_shipments")
    .select("id, tenant_id")
    .eq("id", id)
    .single();

  if (fetchError || !shipment) {
    return NextResponse.json({ error: "Remessa não encontrada" }, { status: 404 });
  }

  const { data: event, error: insertError } = await supabase
    .from("shipment_events")
    .insert({
      tenant_id: shipment.tenant_id,
      shipment_id: id,
      event_type: "NOTE",
      actor_type: "ADMIN",
      actor_name: actorNameFromUser(user),
      visible_to_faction: visibleToFaction,
      payload: { text },
    })
    .select("id, event_type, actor_type, actor_name, visible_to_faction, payload, created_at")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ data: event }, { status: 201 });
}

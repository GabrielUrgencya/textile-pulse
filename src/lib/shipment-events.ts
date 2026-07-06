import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Timeline da remessa (épico Robustez F2/F3) — insert best-effort em
 * shipment_events: falha NUNCA bloqueia o fluxo principal (só console.error).
 *
 * event_type: CREATED | SENT | CONFIRMED | RETURN_DECLARED | RECEIVED |
 * RECONCILED | PAYMENT | NOTE | DEADLINE_CHANGED | CLOSED | REOPENED.
 */
export async function logShipmentEvent(
  supabase: SupabaseClient,
  event: {
    tenantId: string;
    shipmentId: string;
    eventType: string;
    actorType: "ADMIN" | "FACTION" | "SYSTEM";
    actorName?: string | null;
    visibleToFaction?: boolean;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.from("shipment_events").insert({
    tenant_id: event.tenantId,
    shipment_id: event.shipmentId,
    event_type: event.eventType,
    actor_type: event.actorType,
    actor_name: event.actorName ?? null,
    visible_to_faction: event.visibleToFaction ?? true,
    payload: event.payload ?? {},
  });
  if (error) {
    console.error(`logShipmentEvent(${event.eventType}):`, error);
  }
}

/** Nome exibível do admin autenticado (perfil ou e-mail). */
export function actorNameFromUser(user: unknown): string | null {
  const u = user as { profile?: { full_name?: string | null }; email?: string | null };
  return u.profile?.full_name ?? u.email ?? null;
}

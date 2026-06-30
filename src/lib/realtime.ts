import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Realtime channel qualified by tenant (Item 7 v2.1).
 * Channel name: production-updates:{tenantId}
 *
 * Usage (client-side):
 *   const channel = subscribeToProductionUpdates(supabase, tenantId, (payload) => {
 *     // Handle scan_events insert
 *   });
 *
 *   // Cleanup
 *   supabase.removeChannel(channel);
 */
export function subscribeToProductionUpdates(
  supabase: SupabaseClient,
  tenantId: string,
  onScanEvent: (payload: { new: Record<string, unknown> }) => void
) {
  const channelName = `production-updates:${tenantId}`;

  const channel = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "scan_events",
      },
      (payload) => {
        onScanEvent(payload as { new: Record<string, unknown> });
      }
    )
    .subscribe();

  return channel;
}

/**
 * Get the Realtime channel name for a tenant.
 * Useful for server-side references and documentation.
 */
export function getChannelName(tenantId: string): string {
  return `production-updates:${tenantId}`;
}

/**
 * Story 8.40 — Canal de config da TV por tenant (Dashboards 2.0).
 * Usa BROADCAST (não postgres_changes): não exige RLS/sessão, funciona com o
 * cliente anon do kiosk. O builder (8.41) publica; a TV assina e recarrega <2s.
 */
export function getTvConfigChannelName(tenantId: string): string {
  return `tv-config:${tenantId}`;
}

/**
 * Assina o canal de config da TV. `onPublish` recebe o payload { stage_id }.
 * `onStatus` (opcional) reflete o estado da conexão para o indicador da TV.
 */
export function subscribeToTvConfig(
  supabase: SupabaseClient,
  tenantId: string,
  onPublish: (payload: { stage_id?: string }) => void,
  onStatus?: (connected: boolean) => void,
) {
  const channel = supabase
    .channel(getTvConfigChannelName(tenantId), { config: { broadcast: { self: false } } })
    .on("broadcast", { event: "publish" }, (msg) => {
      onPublish((msg.payload || {}) as { stage_id?: string });
    })
    .subscribe((status) => {
      if (onStatus) onStatus(status === "SUBSCRIBED");
    });

  return channel;
}

/**
 * Publica uma atualização de config (builder → TVs do tenant).
 * Envia broadcast 'publish' com o stage_id alterado.
 */
export async function publishTvConfig(
  supabase: SupabaseClient,
  tenantId: string,
  stageId: string,
): Promise<void> {
  const channel = supabase.channel(getTvConfigChannelName(tenantId));
  await new Promise<void>((resolve) => {
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve();
    });
    // resolve de segurança caso o subscribe demore
    setTimeout(() => resolve(), 1500);
  });
  await channel.send({ type: "broadcast", event: "publish", payload: { stage_id: stageId } });
  await supabase.removeChannel(channel);
}

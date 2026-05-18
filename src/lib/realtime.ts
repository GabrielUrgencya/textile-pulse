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

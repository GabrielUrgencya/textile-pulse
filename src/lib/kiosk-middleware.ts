import { createClient } from "@supabase/supabase-js";

export interface KioskSession {
  tenantId: string;
  tokenId: string;
  tokenName: string;
  scope: string;
}

/**
 * Validate a kiosk token from URL query parameter.
 * AC5, AC9: Extracts tenant_id, creates read-only session (no Supabase Auth session).
 * Uses service_role to bypass RLS since kiosk tokens have no auth context.
 */
export async function validateKioskToken(
  token: string | null
): Promise<KioskSession | null> {
  if (!token) return null;

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(token)) return null;

  // Use admin client (service_role) since kiosk has no auth session
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from("kiosk_tokens")
    .select("id, tenant_id, name, scope, is_active")
    .eq("token", token)
    .eq("is_active", true)
    .single();

  if (error || !data) return null;

  return {
    tenantId: data.tenant_id,
    tokenId: data.id,
    tokenName: data.name,
    scope: data.scope,
  };
}

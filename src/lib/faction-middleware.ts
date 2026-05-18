import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export interface FactionSession {
  tenantId: string;
  factionId: string;
  tokenId: string;
  factionName: string;
}

const COOKIE_NAME = "faction_session";

/**
 * Validate faction session from HttpOnly cookie.
 * Returns FactionSession if valid, null otherwise.
 * Uses service_role to bypass RLS (faction has no Supabase Auth user).
 */
export async function validateFactionSession(): Promise<FactionSession | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(COOKIE_NAME);

  if (!sessionCookie?.value) return null;

  let payload: { tokenId: string };
  try {
    payload = JSON.parse(sessionCookie.value);
  } catch {
    return null;
  }

  if (!payload.tokenId) return null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from("faction_tokens")
    .select("id, tenant_id, faction_id, name, is_active, factions!inner(name)")
    .eq("id", payload.tokenId)
    .eq("is_active", true)
    .single();

  if (error || !data) return null;

  const factionData = data.factions as unknown as { name: string } | { name: string }[];
  const factionName = Array.isArray(factionData) ? factionData[0]?.name : factionData?.name;

  return {
    tenantId: data.tenant_id,
    factionId: data.faction_id,
    tokenId: data.id,
    factionName: factionName || data.name,
  };
}

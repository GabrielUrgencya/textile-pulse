import { createSupabaseServerClient } from "@/lib/supabase-server";
import { loadSalesAccess, type SalesAccess } from "@/lib/sales-access";

export type SalesPageAccessState =
  | { kind: "unauthenticated" }
  | { kind: "unavailable" }
  | { kind: "disabled" }
  | { kind: "enabled"; access: SalesAccess };

export async function resolveSalesPageAccess(): Promise<SalesPageAccessState> {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) return { kind: "unauthenticated" };

  const result = await loadSalesAccess(supabase, session.user);
  if (result.error || !result.access) return { kind: "unavailable" };
  if (!result.access.enabled) return { kind: "disabled" };
  return { kind: "enabled", access: result.access };
}

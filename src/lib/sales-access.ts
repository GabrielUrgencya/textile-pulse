import type { SupabaseClient, User } from "@supabase/supabase-js";

export type SalesRole = "ADMIN" | "CONSULTANT";

export interface SalesAccess {
  enabled: boolean;
  tenantId: string | null;
  profileId: string | null;
  role: SalesRole | null;
  isActive: boolean;
}

export interface SalesAccessResult {
  access: SalesAccess | null;
  error: "UNAVAILABLE" | null;
}

interface SalesAccessRpcRow {
  enabled?: boolean;
  tenant_id?: string | null;
  profile_id?: string | null;
  role?: SalesRole | null;
  is_active?: boolean;
}

const DISABLED_ACCESS: SalesAccess = {
  enabled: false,
  tenantId: null,
  profileId: null,
  role: null,
  isActive: false,
};

/**
 * Loads the commercial membership from the canonical database RPC.
 * The RPC derives tenant/profile from the authenticated session and therefore
 * does not accept caller-controlled identifiers.
 */
export async function loadSalesAccess(
  supabase: SupabaseClient,
  user: User,
): Promise<SalesAccessResult> {
  const { data, error } = await supabase.rpc("sales_my_access_v1");

  if (error) {
    console.error("Failed to load LISION Vendas access", {
      userId: user.id,
      code: error.code,
    });
    return { access: null, error: "UNAVAILABLE" };
  }

  const row = (data ?? {}) as SalesAccessRpcRow;
  if (!row.enabled || !row.is_active || !row.role) {
    return { access: DISABLED_ACCESS, error: null };
  }

  return {
    access: {
      enabled: true,
      tenantId: row.tenant_id ?? null,
      profileId: row.profile_id ?? user.id,
      role: row.role,
      isActive: true,
    },
    error: null,
  };
}

export function salesHomeForRole(role: SalesRole): string {
  return role === "ADMIN" ? "/vendas/admin" : "/vendas/app";
}

export function hasSalesRole(
  access: SalesAccess,
  allowedRoles?: readonly SalesRole[],
): boolean {
  if (!access.enabled || !access.isActive || !access.role) return false;
  return !allowedRoles || allowedRoles.includes(access.role);
}

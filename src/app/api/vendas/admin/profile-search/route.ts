import { requireSalesAdminSession, salesAdminResultResponse } from "@/lib/sales-admin-api";
import { searchSalesAdminProfiles } from "@/lib/sales-admin";

/**
 * GET /api/vendas/admin/profile-search?q=termo — busca perfis do tenant para
 * promover a administrador do Vendas (porta explícita; admin-only na RPC).
 */
export async function GET(request: Request) {
  const session = await requireSalesAdminSession();
  if (session.error) return session.error;
  const q = new URL(request.url).searchParams.get("q") ?? "";
  return salesAdminResultResponse(await searchSalesAdminProfiles(session.supabase, q));
}

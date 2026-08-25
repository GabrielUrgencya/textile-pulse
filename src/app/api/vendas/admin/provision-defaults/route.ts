import { requireSalesAdminSession, salesAdminResultResponse } from "@/lib/sales-admin-api";
import { provisionSalesDefaults } from "@/lib/sales-admin-configuration";

/**
 * POST /api/vendas/admin/provision-defaults
 * Inicializa metas/config/período padrão do tenant (self-service). Idempotente.
 * A guarda de ADM de Vendas vive na RPC (SECURITY DEFINER); aqui só exigimos sessão.
 */
export async function POST() {
  const session = await requireSalesAdminSession();
  if (session.error) return session.error;
  return salesAdminResultResponse(await provisionSalesDefaults(session.supabase));
}

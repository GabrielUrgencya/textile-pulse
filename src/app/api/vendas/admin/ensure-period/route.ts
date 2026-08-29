import { requireSalesAdminSession, salesAdminResultResponse } from "@/lib/sales-admin-api";
import { ensureOpenSalesPeriod } from "@/lib/sales-admin-configuration";

/** POST /api/vendas/admin/ensure-period — abre o período do mês corrente se não houver aberto (P4). */
export async function POST() {
  const session = await requireSalesAdminSession();
  if (session.error) return session.error;
  return salesAdminResultResponse(await ensureOpenSalesPeriod(session.supabase));
}

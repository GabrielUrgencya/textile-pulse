import { requireSalesAdminSession, salesAdminResultResponse } from "@/lib/sales-admin-api";
import { deleteSalesPeriod } from "@/lib/sales-admin-configuration";

/** DELETE /api/vendas/admin/periods/[periodId] — exclui período em aberto (sem vendas). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ periodId: string }> }) {
  const session = await requireSalesAdminSession();
  if (session.error) return session.error;
  const { periodId } = await params;
  return salesAdminResultResponse(await deleteSalesPeriod(session.supabase, periodId));
}

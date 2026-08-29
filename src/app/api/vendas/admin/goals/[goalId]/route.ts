import { requireSalesAdminSession, salesAdminResultResponse } from "@/lib/sales-admin-api";
import { deleteSalesGoal } from "@/lib/sales-admin-configuration";

/** DELETE /api/vendas/admin/goals/[goalId] — exclusão definitiva de meta. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ goalId: string }> }) {
  const session = await requireSalesAdminSession();
  if (session.error) return session.error;
  const { goalId } = await params;
  return salesAdminResultResponse(await deleteSalesGoal(session.supabase, goalId));
}

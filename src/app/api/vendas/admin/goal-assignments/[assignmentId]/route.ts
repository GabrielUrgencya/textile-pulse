import { requireSalesAdminSession, salesAdminResultResponse } from "@/lib/sales-admin-api";
import { deleteSalesGoalAssignment } from "@/lib/sales-admin-configuration";

/** DELETE /api/vendas/admin/goal-assignments/[assignmentId] — exclui atribuição (período aberto). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ assignmentId: string }> }) {
  const session = await requireSalesAdminSession();
  if (session.error) return session.error;
  const { assignmentId } = await params;
  return salesAdminResultResponse(await deleteSalesGoalAssignment(session.supabase, assignmentId));
}

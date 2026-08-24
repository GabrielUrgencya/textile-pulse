import { parseSalesAdminBody, requireSalesAdminSession, salesAdminResultResponse } from "@/lib/sales-admin-api";
import { commitSalesPeriodClose, salesCloseCommitInputSchema } from "@/lib/sales-period-close";

export async function POST(request: Request) {
  const session = await requireSalesAdminSession(); if (session.error) return session.error;
  const payload = await parseSalesAdminBody(request, salesCloseCommitInputSchema); if (payload.error) return payload.error;
  return salesAdminResultResponse(await commitSalesPeriodClose(session.supabase, payload.data));
}

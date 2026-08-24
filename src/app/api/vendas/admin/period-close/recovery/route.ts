import { parseSalesAdminBody, requireSalesAdminSession, salesAdminResultResponse } from "@/lib/sales-admin-api";
import { recoverSalesPeriodClose, salesCloseRecoveryInputSchema } from "@/lib/sales-period-close";

export async function POST(request: Request) {
  const session = await requireSalesAdminSession(); if (session.error) return session.error;
  const payload = await parseSalesAdminBody(request, salesCloseRecoveryInputSchema); if (payload.error) return payload.error;
  return salesAdminResultResponse(await recoverSalesPeriodClose(session.supabase, payload.data));
}

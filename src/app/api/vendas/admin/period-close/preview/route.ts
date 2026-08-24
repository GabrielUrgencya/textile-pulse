import { parseSalesAdminBody, requireSalesAdminSession, salesAdminResultResponse } from "@/lib/sales-admin-api";
import { previewSalesPeriodClose, salesClosePreviewInputSchema } from "@/lib/sales-period-close";

export async function POST(request: Request) {
  const session = await requireSalesAdminSession(); if (session.error) return session.error;
  const payload = await parseSalesAdminBody(request, salesClosePreviewInputSchema); if (payload.error) return payload.error;
  return salesAdminResultResponse(await previewSalesPeriodClose(session.supabase, payload.data));
}

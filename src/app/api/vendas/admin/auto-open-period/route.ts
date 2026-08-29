import { parseSalesAdminBody, requireSalesAdminSession, salesAdminResultResponse } from "@/lib/sales-admin-api";
import { setSalesAutoOpenPeriod } from "@/lib/sales-admin-configuration";
import { z } from "zod";

const bodySchema = z.object({ enabled: z.boolean() }).strict();

/** PUT /api/vendas/admin/auto-open-period — liga/desliga a abertura automática de período. */
export async function PUT(request: Request) {
  const session = await requireSalesAdminSession();
  if (session.error) return session.error;
  const payload = await parseSalesAdminBody(request, bodySchema);
  if (payload.error) return payload.error;
  return salesAdminResultResponse(await setSalesAutoOpenPeriod(session.supabase, payload.data.enabled));
}

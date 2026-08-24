import {
  parseSalesAdminBody,
  requireSalesAdminSession,
  salesAdminResultResponse,
} from "@/lib/sales-admin-api";
import {
  reorderSalesAdminPaymentMethods,
  salesPaymentMethodReorderInputSchema,
} from "@/lib/sales-admin";

export async function PUT(request: Request) {
  const session = await requireSalesAdminSession();
  if (session.error) return session.error;
  const payload = await parseSalesAdminBody(
    request,
    salesPaymentMethodReorderInputSchema,
  );
  if (payload.error) return payload.error;
  return salesAdminResultResponse(
    await reorderSalesAdminPaymentMethods(session.supabase, payload.data),
  );
}

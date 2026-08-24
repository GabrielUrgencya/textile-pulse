import {
  parseSalesAdminBody,
  requireSalesAdminSession,
  salesAdminResultResponse,
} from "@/lib/sales-admin-api";
import {
  loadSalesAdminPaymentMethods,
  salesPaymentMethodInputSchema,
  setSalesAdminPaymentMethod,
} from "@/lib/sales-admin";

export async function GET() {
  const session = await requireSalesAdminSession();
  if (session.error) return session.error;
  return salesAdminResultResponse(
    await loadSalesAdminPaymentMethods(session.supabase),
  );
}

export async function PUT(request: Request) {
  const session = await requireSalesAdminSession();
  if (session.error) return session.error;
  const payload = await parseSalesAdminBody(
    request,
    salesPaymentMethodInputSchema,
  );
  if (payload.error) return payload.error;
  return salesAdminResultResponse(
    await setSalesAdminPaymentMethod(session.supabase, payload.data),
  );
}

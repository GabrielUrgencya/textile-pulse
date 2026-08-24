import {
  parseSalesAdminBody,
  requireSalesAdminSession,
  salesAdminResultResponse,
} from "@/lib/sales-admin-api";
import {
  salesMembershipInputSchema,
  setSalesAdminMembership,
} from "@/lib/sales-admin";

export async function PUT(request: Request) {
  const session = await requireSalesAdminSession();
  if (session.error) return session.error;
  const payload = await parseSalesAdminBody(request, salesMembershipInputSchema);
  if (payload.error) return payload.error;
  return salesAdminResultResponse(
    await setSalesAdminMembership(session.supabase, payload.data),
  );
}

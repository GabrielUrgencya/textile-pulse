import {
  requireSalesAdminSession,
  salesAdminResultResponse,
} from "@/lib/sales-admin-api";
import { loadSalesAdminDirectory } from "@/lib/sales-admin";

export async function GET() {
  const session = await requireSalesAdminSession();
  if (session.error) return session.error;
  return salesAdminResultResponse(
    await loadSalesAdminDirectory(session.supabase),
  );
}

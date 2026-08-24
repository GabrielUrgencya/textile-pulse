import { NextResponse } from "next/server";
import { requireSalesAdminSession, salesAdminResultResponse } from "@/lib/sales-admin-api";
import { loadSalesDashboard, salesDashboardQuerySchema } from "@/lib/sales-admin-sales";

export async function GET(request: Request) {
  const session = await requireSalesAdminSession();
  if (session.error) return session.error;
  const url = new URL(request.url);
  const parsed = salesDashboardQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION", message: "Filtros inválidos." } }, { status: 400 });
  return salesAdminResultResponse(await loadSalesDashboard(session.supabase, parsed.data));
}

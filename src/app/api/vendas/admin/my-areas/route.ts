import { requireSalesAdminSession, SALES_ADMIN_NO_STORE } from "@/lib/sales-admin-api";
import { NextResponse } from "next/server";

/** GET /api/vendas/admin/my-areas — áreas efetivas do usuário atual (para a nav). */
export async function GET() {
  const session = await requireSalesAdminSession();
  if (session.error) return session.error;
  const { data, error } = await session.supabase.rpc("sales_my_areas_v1");
  if (error) {
    return NextResponse.json({ data: [] }, { headers: SALES_ADMIN_NO_STORE });
  }
  return NextResponse.json({ data: Array.isArray(data) ? data : [] }, { headers: SALES_ADMIN_NO_STORE });
}

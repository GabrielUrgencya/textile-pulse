import { NextResponse } from "next/server";
import { parseSalesAdminBody, requireSalesAdminSession, salesAdminResultResponse } from "@/lib/sales-admin-api";
import { loadSalesList, salesListQuerySchema, salesUpsertInputSchema, upsertSalesSale } from "@/lib/sales-admin-sales";

export async function GET(request: Request) {
  const session = await requireSalesAdminSession(); if (session.error) return session.error;
  const parsed = salesListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION", message: "Filtros inválidos." } }, { status: 400 });
  return salesAdminResultResponse(await loadSalesList(session.supabase, parsed.data));
}
export async function POST(request: Request) {
  const session = await requireSalesAdminSession(); if (session.error) return session.error;
  const payload = await parseSalesAdminBody(request, salesUpsertInputSchema); if (payload.error) return payload.error;
  return salesAdminResultResponse(await upsertSalesSale(session.supabase, payload.data), 201);
}

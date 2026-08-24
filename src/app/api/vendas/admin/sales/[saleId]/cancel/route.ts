import { NextResponse } from "next/server";
import { parseSalesAdminBody, requireSalesAdminSession, salesAdminResultResponse } from "@/lib/sales-admin-api";
import { cancelSalesSale, salesCancelInputSchema } from "@/lib/sales-admin-sales";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function POST(request: Request, { params }: { params: { saleId: string } }) {
  if (!UUID.test(params.saleId)) return NextResponse.json({ error: { code: "VALIDATION", message: "Venda inválida." } }, { status: 400 });
  const session = await requireSalesAdminSession(); if (session.error) return session.error;
  const payload = await parseSalesAdminBody(request, salesCancelInputSchema); if (payload.error) return payload.error;
  return salesAdminResultResponse(await cancelSalesSale(session.supabase, params.saleId, payload.data));
}

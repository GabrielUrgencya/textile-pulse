import { NextResponse } from "next/server";
import { parseSalesAdminBody, requireSalesAdminSession, salesAdminResultResponse } from "@/lib/sales-admin-api";
import { loadSalesDetail, salesUpsertInputSchema, upsertSalesSale } from "@/lib/sales-admin-sales";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function GET(_request: Request, { params }: { params: { saleId: string } }) {
  if (!UUID.test(params.saleId)) return NextResponse.json({ error: { code: "VALIDATION", message: "Venda inválida." } }, { status: 400 });
  const session = await requireSalesAdminSession(); if (session.error) return session.error;
  return salesAdminResultResponse(await loadSalesDetail(session.supabase, params.saleId));
}
export async function PUT(request: Request, { params }: { params: { saleId: string } }) {
  if (!UUID.test(params.saleId)) return NextResponse.json({ error: { code: "VALIDATION", message: "Venda inválida." } }, { status: 400 });
  const session = await requireSalesAdminSession(); if (session.error) return session.error;
  const payload = await parseSalesAdminBody(request, salesUpsertInputSchema); if (payload.error) return payload.error;
  if (payload.data.saleId !== params.saleId) return NextResponse.json({ error: { code: "VALIDATION", message: "A venda da rota e do conteúdo devem coincidir." } }, { status: 400 });
  return salesAdminResultResponse(await upsertSalesSale(session.supabase, payload.data));
}

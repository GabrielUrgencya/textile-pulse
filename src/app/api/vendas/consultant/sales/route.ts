import { consultantResponse, consultantValidationResponse, parseConsultantBody, requireConsultantSession } from "@/lib/sales-consultant-api";
import { consultantFiltersSchema, consultantSaleInputSchema, loadConsultantSales, upsertConsultantSale } from "@/lib/sales-consultant";

export async function GET(request: Request) {
  const session = await requireConsultantSession(); if (session.error) return session.error;
  const parsed = consultantFiltersSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return consultantValidationResponse("Filtros inválidos.");
  return consultantResponse(await loadConsultantSales(session.supabase, parsed.data));
}

export async function POST(request: Request) {
  const session = await requireConsultantSession(); if (session.error) return session.error;
  const parsed = await parseConsultantBody(request, consultantSaleInputSchema); if (parsed.error) return parsed.error;
  if (parsed.data.saleId !== null) return consultantValidationResponse("Use a rota da venda para editar.");
  return consultantResponse(await upsertConsultantSale(session.supabase, parsed.data), 201);
}

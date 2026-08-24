import { consultantResponse, consultantValidationResponse, parseConsultantBody, requireConsultantSession } from "@/lib/sales-consultant-api";
import { consultantSaleInputSchema, loadConsultantSale, upsertConsultantSale } from "@/lib/sales-consultant";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: { saleId: string } }) {
  const session = await requireConsultantSession(); if (session.error) return session.error;
  if (!UUID.test(params.saleId)) return consultantValidationResponse("Venda inválida.");
  return consultantResponse(await loadConsultantSale(session.supabase, params.saleId));
}

export async function PUT(request: Request, { params }: { params: { saleId: string } }) {
  const session = await requireConsultantSession(); if (session.error) return session.error;
  if (!UUID.test(params.saleId)) return consultantValidationResponse("Venda inválida.");
  const parsed = await parseConsultantBody(request, consultantSaleInputSchema); if (parsed.error) return parsed.error;
  if (parsed.data.saleId !== params.saleId) return consultantValidationResponse("A venda da rota e do conteúdo devem coincidir.");
  return consultantResponse(await upsertConsultantSale(session.supabase, parsed.data));
}

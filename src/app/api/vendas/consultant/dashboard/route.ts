import { consultantResponse, consultantValidationResponse, requireConsultantSession } from "@/lib/sales-consultant-api";
import { consultantDashboardFiltersSchema, loadConsultantDashboard } from "@/lib/sales-consultant";

export async function GET(request: Request) {
  const session = await requireConsultantSession(); if (session.error) return session.error;
  const parsed = consultantDashboardFiltersSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return consultantValidationResponse("Filtros inválidos.");
  return consultantResponse(await loadConsultantDashboard(session.supabase, parsed.data));
}

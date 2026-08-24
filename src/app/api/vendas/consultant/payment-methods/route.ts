import { consultantResponse, requireConsultantSession } from "@/lib/sales-consultant-api";
import { loadConsultantPaymentMethods } from "@/lib/sales-consultant";

export async function GET() {
  const session = await requireConsultantSession(); if (session.error) return session.error;
  return consultantResponse(await loadConsultantPaymentMethods(session.supabase));
}

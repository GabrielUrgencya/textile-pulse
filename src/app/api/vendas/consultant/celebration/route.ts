import { consultantResponse, parseConsultantBody, requireConsultantSession } from "@/lib/sales-consultant-api";
import { claimConsultantCelebration, consultantCelebrationInputSchema } from "@/lib/sales-consultant";

export async function POST(request: Request) {
  const session = await requireConsultantSession(); if (session.error) return session.error;
  const parsed = await parseConsultantBody(request, consultantCelebrationInputSchema); if (parsed.error) return parsed.error;
  return consultantResponse(await claimConsultantCelebration(session.supabase, parsed.data.periodId));
}

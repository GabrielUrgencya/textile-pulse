import { NextResponse } from "next/server";
import type { z } from "zod";
import { withAuth } from "@/lib/auth-middleware";
import type { ConsultantError, ConsultantResult } from "@/lib/sales-consultant";
import { hasSalesRole, loadSalesAccess } from "@/lib/sales-access";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function requireConsultantSession() {
  const auth = await withAuth();
  if (auth.error) return { supabase: null, error: NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sessão inválida ou expirada." } }, { status: 401, headers: NO_STORE }) } as const;
  const access = await loadSalesAccess(auth.supabase, auth.user);
  if (access.error) {
    return { supabase: null, error: NextResponse.json({ error: { code: "SERVICE_UNAVAILABLE", message: "Os dados comerciais estão temporariamente indisponíveis." } }, { status: 503, headers: NO_STORE }) } as const;
  }
  if (!access.access || !hasSalesRole(access.access, ["CONSULTANT"])) {
    return { supabase: null, error: NextResponse.json({ error: { code: "FORBIDDEN", message: "Acesso restrito à área da consultora." } }, { status: 403, headers: NO_STORE }) } as const;
  }
  return { supabase: auth.supabase, error: null } as const;
}

export async function parseConsultantBody<T extends z.ZodType>(request: Request, schema: T): Promise<{ data: z.infer<T>; error: null } | { data: null; error: NextResponse }> {
  let body: unknown;
  try { body = await request.json(); } catch { body = null; }
  const parsed = schema.safeParse(body);
  return parsed.success ? { data: parsed.data, error: null } : { data: null, error: NextResponse.json({ error: { code: "INVALID_INPUT", message: "Dados inválidos para esta operação." } }, { status: 400, headers: NO_STORE }) };
}

export function consultantResponse<T>(result: ConsultantResult<T>, status = 200) {
  if (result.error) return consultantErrorResponse(result.error);
  return NextResponse.json({ data: result.data }, { status, headers: NO_STORE });
}

export function consultantErrorResponse(error: ConsultantError) {
  return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status, headers: NO_STORE });
}

export function consultantValidationResponse(message = "Parâmetros inválidos.") {
  return NextResponse.json({ error: { code: "VALIDATION", message } }, { status: 400, headers: NO_STORE });
}

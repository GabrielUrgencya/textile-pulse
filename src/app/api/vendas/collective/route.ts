import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { loadSalesAccess } from "@/lib/sales-access";
import { collectiveQuerySchema, loadSalesCollective } from "@/lib/sales-collective";

const headers = { "Cache-Control": "no-store" } as const;
export async function GET(request: Request) {
  const auth = await withAuth();
  if (auth.error) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sessão inválida ou expirada." } }, { status: 401, headers });
  const access = await loadSalesAccess(auth.supabase, auth.user);
  if (access.error) return NextResponse.json({ error: { code: "SERVICE_UNAVAILABLE", message: "Painel coletivo temporariamente indisponível." } }, { status: 503, headers });
  if (!access.access?.enabled || !access.access.role || !["ADMIN", "CONSULTANT"].includes(access.access.role)) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Painel coletivo indisponível." } }, { status: 403, headers });
  const parsed = collectiveQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION", message: "Filtros inválidos." } }, { status: 400, headers });
  const result = await loadSalesCollective(auth.supabase, parsed.data);
  return result.error ? NextResponse.json({ error: { code: result.error.code, message: result.error.message } }, { status: result.error.status, headers }) : NextResponse.json({ data: result.data }, { headers });
}

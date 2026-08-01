import { NextResponse } from "next/server";
import { validateFactionSession } from "@/lib/faction-middleware";

/**
 * GET /api/faction/auth/session
 * Checagem LEVE de sessão para o gate do portal (/portal/page.tsx).
 * 200 { ok: true, factionName } se o cookie faction_session é válido
 * (token ainda ativo — revogado NÃO passa); 401 caso contrário.
 *
 * Existe separado de /api/faction/summary de propósito: o gate só precisa
 * saber "há sessão?" para decidir entre mostrar o login ou encaminhar ao
 * dashboard — sem pagar as várias queries do summary.
 */
export async function GET() {
  const session = await validateFactionSession();
  if (!session) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({ ok: true, factionName: session.factionName });
}

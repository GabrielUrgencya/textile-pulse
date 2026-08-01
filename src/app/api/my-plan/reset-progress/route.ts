import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";
import { requireTenantId } from "@/lib/api-helpers";
import { todayInTz } from "@/lib/tz";

/**
 * POST /api/my-plan/reset-progress — zera a PRODUÇÃO DE HOJE de um operador (admin).
 * Body: { userId }.
 *
 * Não apaga bipagem: marca as STAGE_OUT do dia como desconsideradas
 * (scan_events.disregarded_at). Elas somem de toda métrica — meta, ranking,
 * relatório, TV — mas permanecem no histórico do lote, preservando a
 * rastreabilidade de por onde a peça passou.
 *
 * A escrita acontece na função reset_user_day_progress (SECURITY DEFINER), que
 * revalida ADMIN e tenant no banco. A sessão do usuário NÃO tem privilégio de
 * UPDATE em scan_events — o gate abaixo é a primeira camada, não a única.
 *
 * NÃO mexe em goal_deficits: zerar progresso e zerar dívida são ações distintas.
 */
export async function POST(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  if (!can(user, "settings:manage")) {
    return NextResponse.json({ error: "Forbidden: settings:manage required" }, { status: 403 });
  }

  const t = requireTenantId(user);
  if (t.error) return t.error;

  const body = await request.json().catch(() => null);
  const targetUserId: string | undefined = body?.userId;
  if (!targetUserId || typeof targetUserId !== "string") {
    return NextResponse.json({ error: "userId é obrigatório" }, { status: 400 });
  }

  // O dia vem SEMPRE do servidor, no fuso do tenant. Aceitar data do cliente
  // permitiria zerar um dia arbitrário do passado.
  const today = todayInTz();

  // Confere o alvo dentro do tenant antes de agir (mensagem melhor que a
  // exceção da função, que é o gate real).
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, tenant_id")
    .eq("id", targetUserId)
    .eq("tenant_id", t.tenantId)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "Operador não encontrado neste tenant" }, { status: 404 });
  }

  const { data: cleared, error } = await supabase.rpc("reset_user_day_progress", {
    p_target_user: targetUserId,
    p_day: today,
  });

  if (error) {
    console.error("[reset-progress] rpc:", error);
    return NextResponse.json({ error: "Falha ao zerar o progresso" }, { status: 500 });
  }

  const count = Number(cleared) || 0;

  // Auditoria (padrão audit_log do projeto) — best-effort.
  const { error: auditError } = await supabase.from("audit_log").insert({
    tenant_id: t.tenantId,
    user_id: user.id,
    action: "PROGRESS_MANUAL_RESET",
    entity_type: "scan_events",
    entity_id: targetUserId,
    details: {
      day: today,
      // Quantas bipagens deixaram de contar — é este número que protege numa
      // disputa com o operador ("zeraram minha produção, quando e quanto?").
      scans_disregarded: count,
      target_user: profile.full_name ?? targetUserId,
      admin: (user as { email?: string | null }).email ?? user.id,
    },
  });
  if (auditError) console.error("[reset-progress] audit_log:", auditError);

  return NextResponse.json({
    data: { user_id: targetUserId, day: today, scans_disregarded: count },
  });
}

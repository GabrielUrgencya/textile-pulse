import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";
import { dbError, requireTenantId } from "@/lib/api-helpers";
import { todayInTz } from "@/lib/tz";
import { prevBusinessDay, prevWeekStart, prevMonthStart, type PeriodType } from "@/lib/goal-deficits";

/**
 * POST /api/my-plan/reset-goal — Zeração MANUAL de meta por período (admin).
 * Body: { period: "daily"|"weekly"|"monthly", userId? }.
 *
 * Grava deficit=0 na linha do período ANTERIOR de goal_deficits (a mesma
 * referência que getActiveDeficits lê). O INSERT com deficit=0 quando não há
 * linha é essencial: também desliga o fallback dinâmico do rollover na diária
 * (user-meta usa o persistido quando existe). Independente por período; a
 * automação de fechamento (cron goal-closures) NÃO é alterada — o próximo
 * fechamento segue normal (upsert ignoreDuplicates não sobrescreve esta linha).
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
  const period = body?.period as PeriodType | undefined;
  if (!period || !["daily", "weekly", "monthly"].includes(period)) {
    return NextResponse.json({ error: "period (daily|weekly|monthly) é obrigatório" }, { status: 400 });
  }
  const targetUserId: string = body?.userId || user.id;

  const today = todayInTz();
  const ref =
    period === "daily" ? prevBusinessDay(today) : period === "weekly" ? prevWeekStart(today) : prevMonthStart(today);

  // Tenant do alvo (defesa extra: alvo precisa ser do mesmo tenant do admin)
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, tenant_id, full_name")
    .eq("id", targetUserId)
    .maybeSingle();
  if (!profile || profile.tenant_id !== t.tenantId) {
    return NextResponse.json({ error: "Usuário não encontrado neste tenant" }, { status: 404 });
  }

  // UPDATE se a linha do período anterior existe; senão INSERT com deficit=0.
  // base_goal/produced = 0 no INSERT: são campos de auditoria do fechamento —
  // aqui a linha existe apenas para afirmar "déficit zerado manualmente".
  const { data: existing } = await supabase
    .from("goal_deficits")
    .select("id")
    .eq("user_id", targetUserId)
    .eq("period_type", period)
    .eq("period_reference", ref)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("goal_deficits")
      .update({ deficit: 0, carried_to: today })
      .eq("id", existing.id);
    if (error) return dbError("POST /api/my-plan/reset-goal (update)", error);
  } else {
    const { error } = await supabase.from("goal_deficits").insert({
      tenant_id: profile.tenant_id,
      user_id: targetUserId,
      period_type: period,
      period_reference: ref,
      base_goal: 0,
      produced: 0,
      deficit: 0,
      carried_to: today,
    });
    if (error) return dbError("POST /api/my-plan/reset-goal (insert)", error);
  }

  // Auditoria (padrão audit_log do projeto) — best-effort.
  const { error: auditError } = await supabase.from("audit_log").insert({
    tenant_id: t.tenantId,
    user_id: user.id,
    action: "GOAL_MANUAL_RESET",
    entity_type: "goal_deficit",
    entity_id: targetUserId,
    details: {
      period,
      period_reference: ref,
      target_user: profile.full_name ?? targetUserId,
      admin: (user as { email?: string | null }).email ?? user.id,
    },
  });
  if (auditError) console.error("[reset-goal] audit_log:", auditError);

  return NextResponse.json({ data: { period, period_reference: ref, user_id: targetUserId, deficit: 0 } });
}

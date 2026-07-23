import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";
import { requireTenantId } from "@/lib/api-helpers";
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
  const period = body?.period as PeriodType | "all" | undefined;
  if (!period || !["daily", "weekly", "monthly", "all"].includes(period)) {
    return NextResponse.json({ error: "period (daily|weekly|monthly|all) é obrigatório" }, { status: 400 });
  }
  const targetUserId: string = body?.userId || user.id;

  const today = todayInTz();
  // "all" limpa os TRÊS de uma vez: para o dono da fábrica a dívida é UMA coisa —
  // período é recorte técnico nosso. Zerar só um deixava o operador ainda vendo
  // dívida na tela dele, que é pior do que não ter zerado nada.
  const periods: PeriodType[] = period === "all" ? ["daily", "weekly", "monthly"] : [period];
  const refOf = (p: PeriodType) =>
    p === "daily" ? prevBusinessDay(today) : p === "weekly" ? prevWeekStart(today) : prevMonthStart(today);

  // Tenant do alvo (defesa extra: alvo precisa ser do mesmo tenant do admin)
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, tenant_id, full_name")
    .eq("id", targetUserId)
    .maybeSingle();
  if (!profile || profile.tenant_id !== t.tenantId) {
    return NextResponse.json({ error: "Usuário não encontrado neste tenant" }, { status: 404 });
  }

  // Zera cada período: UPDATE se a linha da referência existe; senão INSERT com
  // deficit=0. O INSERT é essencial — também desliga o fallback dinâmico do
  // rollover (user-meta prefere o persistido quando ele existe).
  // base_goal/produced = 0 no INSERT: são campos de auditoria do fechamento;
  // aqui a linha existe apenas para afirmar "déficit zerado manualmente".
  const cleared: Record<string, number> = {}; // o que foi perdoado, por período
  const failed: string[] = [];

  for (const p of periods) {
    const ref = refOf(p);
    const { data: existing } = await supabase
      .from("goal_deficits")
      .select("id, deficit")
      .eq("user_id", targetUserId)
      .eq("period_type", p)
      .eq("period_reference", ref)
      .maybeSingle();

    if (existing) {
      cleared[p] = Number(existing.deficit) || 0;
      const { error } = await supabase
        .from("goal_deficits")
        .update({ deficit: 0, carried_to: today })
        .eq("id", existing.id);
      if (error) { failed.push(p); continue; }
    } else {
      cleared[p] = 0;
      const { error } = await supabase.from("goal_deficits").insert({
        tenant_id: profile.tenant_id,
        user_id: targetUserId,
        period_type: p,
        period_reference: ref,
        base_goal: 0,
        produced: 0,
        deficit: 0,
        carried_to: today,
      });
      if (error) { failed.push(p); continue; }
    }
  }

  // Falha parcial NÃO pode passar silenciosa: é justamente o estado inconsistente
  // (um período limpo, outro não) que este endpoint existe para evitar.
  if (failed.length > 0) {
    return NextResponse.json(
      {
        error: `Falha ao zerar: ${failed.join(", ")}`,
        zerados: Object.keys(cleared).filter((k) => !failed.includes(k)),
        nao_zerados: failed,
      },
      { status: 500 },
    );
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
      // Quanto foi perdoado em cada período — é este número que protege numa
      // disputa com o operador ("zeraram 5.500 peças minhas, quando?").
      cleared,
      period_references: Object.fromEntries(periods.map((p) => [p, refOf(p)])),
      target_user: profile.full_name ?? targetUserId,
      admin: (user as { email?: string | null }).email ?? user.id,
    },
  });
  if (auditError) console.error("[reset-goal] audit_log:", auditError);

  return NextResponse.json({
    data: { period, periods, cleared, user_id: targetUserId, deficit: 0 },
  });
}

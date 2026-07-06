import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { computeUserMeta } from "@/lib/user-meta";
import { prevBusinessDay, prevWeekStart, prevMonthStart } from "@/lib/goal-deficits";

/**
 * GET /api/cron/goal-closures — Fechamento de metas acumulativas (épico Metas).
 * Roda diariamente (00:30 América/SP). Idempotente: UNIQUE(user,type,ref) +
 * upsert ignoreDuplicates — rodar N vezes não duplica nem sobrescreve.
 *
 * REUSA computeUserMeta como motor de medição (mesma métrica do dashboard:
 * STAGE_OUT ponderado, OPs canceladas excluídas, meta efetiva com cadeia de
 * déficit). deficit = MAX(0, meta_efetiva − produzido); meta batida → 0 (sem
 * linha só se sem meta; com meta batida grava deficit=0 para auditoria).
 * Usuários SEM meta são pulados (não acumula sobre meta inexistente).
 */

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function lastDayOfMonth(monthStart: string): string {
  const y = Number(monthStart.slice(0, 4));
  const m = Number(monthStart.slice(5, 7));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${monthStart.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

interface ClosureRow {
  tenant_id: string;
  user_id: string;
  period_type: "daily" | "weekly" | "monthly";
  period_reference: string;
  base_goal: number;
  produced: number;
  deficit: number;
  carried_to: string;
}

export async function GET(request: Request) {
  const headerSecret = request.headers.get("x-cron-secret");
  const bearer = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  const authorized =
    !!expected && (headerSecret === expected || bearer === `Bearer ${expected}`);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  const dow = new Date(`${today}T12:00:00.000Z`).getUTCDay();
  const isMonday = dow === 1;
  const isFirstOfMonth = today.endsWith("-01");

  // Candidatos: usuários com meta explícita OU setor definido (fallback do
  // computeUserMeta) — quem não resolver meta é pulado adiante.
  const [utRes, profRes] = await Promise.all([
    supabaseAdmin.from("user_targets").select("user_id"),
    supabaseAdmin.from("profiles").select("id, tenant_id").not("sector", "is", null),
  ]);
  const tenantByUser = new Map<string, string>();
  for (const p of profRes.data || []) tenantByUser.set(p.id, p.tenant_id);
  // user_targets sem sector: buscar tenant desses perfis
  const missing = (utRes.data || []).map((u) => u.user_id).filter((id) => !tenantByUser.has(id));
  if (missing.length > 0) {
    const { data: extra } = await supabaseAdmin
      .from("profiles").select("id, tenant_id").in("id", missing);
    for (const p of extra || []) tenantByUser.set(p.id, p.tenant_id);
  }
  const userIds = Array.from(
    new Set([...(utRes.data || []).map((u) => u.user_id), ...(profRes.data || []).map((p) => p.id)]),
  );

  const rows: ClosureRow[] = [];
  const closed = { daily: 0, weekly: 0, monthly: 0 };

  for (const userId of userIds) {
    const tenantId = tenantByUser.get(userId);
    if (!tenantId) continue;

    // ── Fechamento DIÁRIO (último dia útil anterior) ──────────────────────
    const closedDay = prevBusinessDay(today);
    const dayMeta = await computeUserMeta(supabaseAdmin, userId, closedDay, closedDay).catch(() => null);
    if (dayMeta?.target && dayMeta.target > 0) {
      rows.push({
        tenant_id: tenantId,
        user_id: userId,
        period_type: "daily",
        period_reference: closedDay,
        base_goal: Math.round(dayMeta.target),
        produced: Math.round(dayMeta.progress),
        deficit: Math.max(0, Math.round(dayMeta.target - dayMeta.progress)),
        carried_to: today,
      });
      closed.daily++;
    }

    // ── Fechamento SEMANAL (segunda-feira fecha a semana anterior) ───────
    if (isMonday) {
      const wkStart = prevWeekStart(today);
      const wkEnd = addDays(wkStart, 6);
      const wkMeta = await computeUserMeta(supabaseAdmin, userId, wkEnd, wkEnd).catch(() => null);
      const wkTarget = wkMeta?.weekly?.target;
      if (wkMeta && wkTarget && wkTarget > 0) {
        rows.push({
          tenant_id: tenantId,
          user_id: userId,
          period_type: "weekly",
          period_reference: wkStart,
          base_goal: Math.round(wkTarget),
          produced: Math.round(wkMeta.weekly.progress),
          deficit: Math.max(0, Math.round(wkTarget - wkMeta.weekly.progress)),
          carried_to: today,
        });
        closed.weekly++;
      }
    }

    // ── Fechamento MENSAL (dia 1 fecha o mês anterior) ───────────────────
    if (isFirstOfMonth) {
      const moStart = prevMonthStart(today);
      const moEnd = lastDayOfMonth(moStart);
      const moMeta = await computeUserMeta(supabaseAdmin, userId, moEnd, moEnd).catch(() => null);
      const moTarget = moMeta?.monthly?.target;
      if (moMeta && moTarget && moTarget > 0) {
        rows.push({
          tenant_id: tenantId,
          user_id: userId,
          period_type: "monthly",
          period_reference: moStart,
          base_goal: Math.round(moTarget),
          produced: Math.round(moMeta.monthly.progress),
          deficit: Math.max(0, Math.round(moTarget - moMeta.monthly.progress)),
          carried_to: today,
        });
        closed.monthly++;
      }
    }
  }

  if (rows.length > 0) {
    const { error } = await supabaseAdmin
      .from("goal_deficits")
      .upsert(rows, { onConflict: "user_id,period_type,period_reference", ignoreDuplicates: true });
    if (error) {
      return NextResponse.json({ error: error.message, attempted: rows.length }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, closed, users: userIds.length });
}

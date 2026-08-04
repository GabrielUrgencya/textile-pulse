import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";
import { requireTenantId } from "@/lib/api-helpers";
import { todayInTz, localDayStart, TENANT_UTC_OFFSET } from "@/lib/tz";
import {
  weekStartOf,
  monthStartOf,
  prevBusinessDay,
  prevWeekStart,
  prevMonthStart,
} from "@/lib/goal-deficits";

/**
 * POST /api/settings/sector-targets/reset — Frente 1.
 * Zera, por SETOR e por PERÍODO, o PROGRESSO (produção acumulada) OU a DÍVIDA
 * (goal_deficits) — ações distintas, escolhidas separadamente. Admin only.
 *
 * Body: { stage_id, period: "hour"|"day"|"week"|"month", target: "progress"|"debt" }
 *
 * - progress: desconsidera as STAGE_OUT do setor na janela do período (via RPC
 *   SECURITY DEFINER reset_sector_progress). Não apaga bipagem — preserva o
 *   histórico do lote. Vale para hora/dia/semana/mês.
 * - debt: grava deficit=0 no goal_deficits (scope=SECTOR) do período. Só o
 *   DIÁRIO acumula dívida hoje para setores; semanal/mensal ficam pré-zerados
 *   (no-op honesto). A meta por HORA é motivacional e não acumula — recusa.
 */

type Period = "hour" | "day" | "week" | "month";
type Target = "progress" | "debt";

const PERIODS: Period[] = ["hour", "day", "week", "month"];
const TARGETS: Target[] = ["progress", "debt"];

const pad = (n: number) => String(n).padStart(2, "0");
function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function nextMonthStart(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
}
/** Data + hora "agora" no fuso do tenant (via Intl, sem assumir DST). */
function nowInTenant(): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  return { date: `${g("year")}-${g("month")}-${g("day")}`, hour: Number(g("hour")) % 24 };
}

/**
 * Janela [from, to) do período atual, como instantes ISO no fuso do tenant.
 * O limite SUPERIOR é o FIM do período (não o "agora" do app) — de propósito:
 * as bipagens carregam o relógio do BANCO e o app pode ter skew de segundos;
 * fechar no fim do período evita excluir uma bipagem recém-gravada. Não há
 * bipagem no futuro, então isto zera exatamente o período corrente.
 */
function periodWindow(period: Period, today: string): { from: string; to: string } {
  if (period === "day") {
    return { from: localDayStart(today), to: localDayStart(addDays(today, 1)) };
  }
  if (period === "week") {
    const ws = weekStartOf(today);
    return { from: localDayStart(ws), to: localDayStart(addDays(ws, 7)) };
  }
  if (period === "month") {
    const ms = monthStartOf(today);
    return { from: localDayStart(ms), to: localDayStart(nextMonthStart(ms)) };
  }
  // hour: janela cheia da hora corrente no fuso do tenant.
  const { date, hour } = nowInTenant();
  const from = `${date}T${pad(hour)}:00:00.000${TENANT_UTC_OFFSET}`;
  const to = hour === 23 ? localDayStart(addDays(date, 1)) : `${date}T${pad(hour + 1)}:00:00.000${TENANT_UTC_OFFSET}`;
  return { from, to };
}

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
  const stageId: string | undefined = body?.stage_id;
  const period = body?.period as Period | undefined;
  const target = body?.target as Target | undefined;

  if (!stageId || typeof stageId !== "string") {
    return NextResponse.json({ error: "stage_id é obrigatório" }, { status: 400 });
  }
  if (!period || !PERIODS.includes(period)) {
    return NextResponse.json({ error: "period (hour|day|week|month) é obrigatório" }, { status: 400 });
  }
  if (!target || !TARGETS.includes(target)) {
    return NextResponse.json({ error: "target (progress|debt) é obrigatório" }, { status: 400 });
  }

  // Setor tem de ser do tenant (mensagem melhor; o gate real é a RPC/RLS).
  const { data: stage } = await supabase
    .from("stages")
    .select("id, display_name, tenant_id")
    .eq("id", stageId)
    .eq("tenant_id", t.tenantId)
    .maybeSingle();
  if (!stage) {
    return NextResponse.json({ error: "Setor não encontrado neste tenant" }, { status: 404 });
  }

  const today = todayInTz();

  // ── PROGRESSO ──────────────────────────────────────────────────────
  if (target === "progress") {
    const { from, to } = periodWindow(period, today);
    const { data: cleared, error } = await supabase.rpc("reset_sector_progress", {
      p_stage: stageId,
      p_from: from,
      p_to: to,
    });
    if (error) {
      console.error("[sector reset progress] rpc:", error);
      return NextResponse.json({ error: "Falha ao zerar o progresso" }, { status: 500 });
    }
    const count = Number(cleared) || 0;

    const { error: auditError } = await supabase.from("audit_log").insert({
      tenant_id: t.tenantId,
      user_id: user.id,
      action: "SECTOR_PROGRESS_RESET",
      entity_type: "scan_events",
      entity_id: stageId,
      details: {
        period, from, to,
        scans_disregarded: count,
        sector: stage.display_name ?? stageId,
        admin: (user as { email?: string | null }).email ?? user.id,
      },
    });
    if (auditError) console.error("[sector reset progress] audit_log:", auditError);

    return NextResponse.json({ data: { stage_id: stageId, period, target, scans_disregarded: count } });
  }

  // ── DÍVIDA ─────────────────────────────────────────────────────────
  // A meta por hora é motivacional: zera a cada virada e nunca acumula. Não há
  // dívida para perdoar — recusa explícita em vez de gravar linha sem sentido.
  if (period === "hour") {
    return NextResponse.json(
      { error: "A meta por hora é motivacional e não acumula dívida — não há dívida para zerar." },
      { status: 400 },
    );
  }

  const periodType = period === "day" ? "daily" : period === "week" ? "weekly" : "monthly";
  const ref =
    period === "day" ? prevBusinessDay(today) : period === "week" ? prevWeekStart(today) : prevMonthStart(today);

  const { data: existing } = await supabase
    .from("goal_deficits")
    .select("id, deficit")
    .eq("tenant_id", t.tenantId)
    .eq("scope", "SECTOR")
    .eq("stage_id", stageId)
    .eq("period_type", periodType)
    .eq("period_reference", ref)
    .maybeSingle();

  let clearedDeficit = 0;
  if (existing) {
    clearedDeficit = Number(existing.deficit) || 0;
    const { error } = await supabase
      .from("goal_deficits")
      .update({ deficit: 0, carried_to: today })
      .eq("id", existing.id);
    if (error) {
      console.error("[sector reset debt] update:", error);
      return NextResponse.json({ error: "Falha ao zerar a dívida" }, { status: 500 });
    }
  } else {
    // Sem linha persistida (semanal/mensal do setor ainda não fecham): grava
    // deficit=0 para afirmar "dívida zerada" e desligar qualquer fallback futuro.
    const { error } = await supabase.from("goal_deficits").insert({
      tenant_id: t.tenantId,
      user_id: null,
      stage_id: stageId,
      scope: "SECTOR",
      period_type: periodType,
      period_reference: ref,
      base_goal: 0,
      produced: 0,
      deficit: 0,
      carried_to: today,
    });
    if (error) {
      console.error("[sector reset debt] insert:", error);
      return NextResponse.json({ error: "Falha ao zerar a dívida" }, { status: 500 });
    }
  }

  const { error: auditError } = await supabase.from("audit_log").insert({
    tenant_id: t.tenantId,
    user_id: user.id,
    action: "SECTOR_DEBT_RESET",
    entity_type: "goal_deficit",
    entity_id: stageId,
    details: {
      period, period_type: periodType, period_reference: ref,
      cleared_deficit: clearedDeficit,
      sector: stage.display_name ?? stageId,
      admin: (user as { email?: string | null }).email ?? user.id,
    },
  });
  if (auditError) console.error("[sector reset debt] audit_log:", auditError);

  return NextResponse.json({ data: { stage_id: stageId, period, target, cleared_deficit: clearedDeficit } });
}

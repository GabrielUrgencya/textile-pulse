import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";
import { dbError, requireTenantId } from "@/lib/api-helpers";
import { todayInTz, TENANT_UTC_OFFSET } from "@/lib/tz";
import { computeUserMeta } from "@/lib/user-meta";
import { localDay } from "@/lib/rollover";

/**
 * GET /api/my-plan?userId= — Módulo "Meu Plano" (épico Meu Plano).
 *
 * Retorna, para o usuário-alvo:
 *  - meta: computeUserMeta do dia (mesma métrica do dashboard);
 *  - plans: planos do MÊS corrente visíveis ao alvo (regra específico>geral,
 *    igual ao daily-plan), agrupáveis por dia no cliente (Hoje/Semana/Mês);
 *  - producedByDay: produção ponderada por dia no mês corrente (para status
 *    concluído/pendente dos planos) — 1 query, dedupe lote/dia como o rollover;
 *  - history: últimos 30 dias {date, produced, target} para o gráfico;
 *  - profile: {id, full_name, sector} do alvo.
 *
 * Segurança: usuário comum SEMPRE vê a si mesmo — userId na query exige
 * settings:manage (403 caso contrário).
 */

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function monthStartOf(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export async function GET(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  const t = requireTenantId(user);
  if (t.error) return t.error;

  const { searchParams } = new URL(request.url);
  const requestedUserId = searchParams.get("userId");

  let targetUserId = user.id;
  if (requestedUserId && requestedUserId !== user.id) {
    if (!can(user, "settings:manage")) {
      return NextResponse.json(
        { error: "Forbidden: apenas administradores podem visualizar outros usuários" },
        { status: 403 },
      );
    }
    targetUserId = requestedUserId;
  }

  const today = todayInTz();
  const monthStart = monthStartOf(today);
  const historyStart = addDays(today, -29);
  const windowStart = historyStart < monthStart ? historyStart : monthStart;

  // ── Meta do dia (mesmo motor do dashboard) + perfil do alvo ──────────────
  const [meta, profileRes, plansRes] = await Promise.all([
    computeUserMeta(supabase, targetUserId, today, today).catch(() => null),
    supabase.from("profiles").select("id, full_name, sector").eq("id", targetUserId).maybeSingle(),
    supabase
      .from("daily_plans")
      .select("id, plan_date, name, is_general, target_override, notes")
      .gte("plan_date", monthStart)
      .lte("plan_date", today.slice(0, 7) + "-31")
      .order("plan_date", { ascending: true }),
  ]);

  if (profileRes.error) return dbError("GET /api/my-plan (profile)", profileRes.error);
  if (plansRes.error) return dbError("GET /api/my-plan (plans)", plansRes.error);

  // ── Visibilidade dos planos (regra do daily-plan: específico > geral) ────
  const allPlans = plansRes.data || [];
  const restrictedIds = allPlans.filter((p) => p.is_general === false).map((p) => p.id as string);
  let memberPlanIds = new Set<string>();
  if (restrictedIds.length > 0) {
    const { data: memberships } = await supabase
      .from("daily_plan_members")
      .select("plan_id")
      .eq("profile_id", targetUserId)
      .in("plan_id", restrictedIds);
    memberPlanIds = new Set((memberships || []).map((m) => m.plan_id as string));
  }
  // Por dia: se o alvo tem plano restrito naquele dia, só ele vale; senão os gerais.
  const byDate = new Map<string, typeof allPlans>();
  for (const p of allPlans) {
    const arr = byDate.get(p.plan_date as string) ?? [];
    arr.push(p);
    byDate.set(p.plan_date as string, arr);
  }
  const visiblePlans: typeof allPlans = [];
  for (const [, dayPlans] of Array.from(byDate)) {
    const mine = dayPlans.filter((p) => p.is_general === false && memberPlanIds.has(p.id as string));
    visiblePlans.push(...(mine.length > 0 ? mine : dayPlans.filter((p) => p.is_general === true)));
  }

  // Itens dos planos visíveis
  const visibleIds = visiblePlans.map((p) => p.id as string);
  const { data: items } = visibleIds.length
    ? await supabase
        .from("daily_plan_items")
        .select("id, plan_id, reference, color, size_label, quantity, meta_value, sort_order")
        .in("plan_id", visibleIds)
        .order("sort_order", { ascending: true })
    : { data: [] as Array<Record<string, unknown>> };
  const itemsByPlan = new Map<string, Array<Record<string, unknown>>>();
  for (const it of items || []) {
    const arr = itemsByPlan.get(it.plan_id as string) ?? [];
    arr.push(it);
    itemsByPlan.set(it.plan_id as string, arr);
  }
  const plans = visiblePlans.map((p) => {
    const planItems = itemsByPlan.get(p.id as string) ?? [];
    const meta =
      p.target_override != null
        ? Number(p.target_override)
        : planItems.reduce((acc, it) => acc + (Number(it.meta_value) || 0), 0);
    return { ...p, items: planItems, meta };
  });

  // ── Produção ponderada por dia (histórico + status dos planos) ───────────
  // Mesma métrica do rollover/computeUserMeta: STAGE_OUT na etapa do usuário,
  // dedupe lote/dia, coeficiente por referência, OPs canceladas fora.
  const { data: ut } = await supabase
    .from("user_targets")
    .select("stage_id, daily_target")
    .eq("user_id", targetUserId)
    .maybeSingle();
  let stageId: string | null = ut?.stage_id ?? null;
  if (!stageId) {
    const sector = (profileRes.data?.sector || "").trim();
    if (sector) {
      const { data: stage } = await supabase.from("stages").select("id").ilike("name", sector).maybeSingle();
      stageId = stage?.id ?? null;
    }
  }

  const producedByDay: Record<string, number> = {};
  let baseDailyTarget: number | null = ut?.daily_target ?? null;
  if (stageId) {
    if (baseDailyTarget === null) {
      const { data: st } = await supabase
        .from("sector_targets")
        .select("daily_target")
        .eq("stage_id", stageId)
        .maybeSingle();
      baseDailyTarget = (st?.daily_target as number) ?? null;
    }
    const { data: coeffs } = await supabase
      .from("reference_stage_targets")
      .select("reference, coefficient")
      .eq("stage_id", stageId);
    const coeffMap = new Map<string, number>(
      (coeffs || []).map((c) => [String(c.reference), Number(c.coefficient) || 1.0]),
    );

    const { data: rows } = await supabase
      .from("scan_events")
      .select("lot_id, scanned_at, lots!inner(quantity, production_orders!inner(reference))")
      .eq("user_id", targetUserId)
      .eq("stage_id", stageId)
      .eq("event_type", "STAGE_OUT")
      .neq("lots.production_orders.status", "CANCELLED")
      .gte("scanned_at", `${windowStart}T00:00:00.000${TENANT_UTC_OFFSET}`)
      .lte("scanned_at", `${today}T23:59:59.999${TENANT_UTC_OFFSET}`);

    const seenLotDay = new Set<string>();
    for (const r of (rows || []) as Array<{ lot_id: string; scanned_at: string; lots: unknown }>) {
      const day = localDay(r.scanned_at);
      const dk = `${day}|${r.lot_id}`;
      if (seenLotDay.has(dk)) continue;
      seenLotDay.add(dk);
      const lotRel = r.lots;
      const lot = (Array.isArray(lotRel) ? lotRel[0] : lotRel) as {
        quantity?: number | string | null;
        production_orders?: unknown;
      } | null;
      const qty = Number(lot?.quantity) || 0;
      const poRel = lot?.production_orders;
      const po = (Array.isArray(poRel) ? poRel[0] : poRel) as { reference: string | null } | null;
      producedByDay[day] = (producedByDay[day] || 0) + qty * (coeffMap.get(po?.reference ?? "") ?? 1.0);
    }
  }

  // ── Histórico 30d (dias com data <= hoje; meta base por dia) ─────────────
  const history: Array<{ date: string; produced: number; target: number | null }> = [];
  for (let d = historyStart; d <= today; d = addDays(d, 1)) {
    history.push({
      date: d,
      produced: Math.round((producedByDay[d] || 0) * 10) / 10,
      target: baseDailyTarget,
    });
  }

  return NextResponse.json({
    data: {
      meta,
      plans,
      producedByDay,
      history,
      profile: profileRes.data
        ? { id: profileRes.data.id, full_name: profileRes.data.full_name, sector: profileRes.data.sector }
        : null,
      today,
      isAdmin: can(user, "settings:manage"),
    },
  });
}

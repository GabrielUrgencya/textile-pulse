import type { SupabaseClient } from "@supabase/supabase-js";
import { TENANT_UTC_OFFSET } from "@/lib/tz";
import { getActiveDeficits, accumulatedGoal } from "@/lib/goal-deficits";
import { getTenantCalendar, workingDaysBetween, workingDaysPerWeek, DEFAULT_CALENDAR } from "@/lib/work-calendar";

export interface PeriodProgress {
  target: number | null;
  progress: number;
  estimated: boolean; // true = derivada da diária (não cadastrada)
}

/** Déficits acumulados vigentes (épico Metas) — alimenta o ticker. */
export interface UserDeficits {
  daily: number;
  weekly: number;
  monthly: number;
}

export interface UserMeta {
  stage_id: string;
  stage_name: string;
  target: number | null;
  unit: string | null;
  progress: number;
  percent: number;
  // Story 8.37 — extensões do dashboard individual
  weekly: PeriodProgress;
  monthly: PeriodProgress;
  elapsed_since_first_scan_min: number | null;
  avg_per_lot_min: number | null;
  completed: boolean;
  /** Déficits acumulados vigentes por granularidade (0 = em dia). */
  deficits: UserDeficits;
}

function dayStartAbs(date: string) {
  return `${date}T00:00:00.000${TENANT_UTC_OFFSET}`;
}
function dayEndAbs(date: string) {
  return `${date}T23:59:59.999${TENANT_UTC_OFFSET}`;
}
function weekStart(date: string): string {
  const d = new Date(`${date}T12:00:00.000Z`);
  const dow = d.getUTCDay();
  const diff = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}
function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}
function monthEnd(date: string): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const last = new Date(y, m, 0).getDate();
  return `${date.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

interface ScanRow {
  scanned_at: string;
  lots:
    | { quantity: number | string | null; production_orders: { reference: string | null } | { reference: string | null }[] }
    | { quantity: number | string | null; production_orders: { reference: string | null } | { reference: string | null }[] }[]
    | null;
}
function weightedSum(rows: ScanRow[], coeffMap: Map<string, number>): number {
  let total = 0;
  for (const s of rows) {
    const lotRel = s.lots;
    const lot = (Array.isArray(lotRel) ? lotRel[0] : lotRel) as { quantity?: number | string | null; production_orders?: unknown } | null;
    const qty = Number(lot?.quantity) || 0;
    const poRel = lot?.production_orders;
    const po = (Array.isArray(poRel) ? poRel[0] : poRel) as { reference: string | null } | null;
    total += qty * (coeffMap.get(po?.reference ?? "") ?? 1.0);
  }
  return Math.round(total * 10) / 10;
}

/**
 * Story 8.21 + 8.37 — Meta personalizada do usuário logado (por setor/etapa).
 *
 * Resolve a etapa do usuário:
 *   1) user_targets (atribuição explícita do admin) — prevalece;
 *   2) fallback: profiles.sector casando com stages.name.
 *
 * Meta diária = user_targets.daily_target ?? sector_targets.daily_target.
 * Progresso = Σ (lots.quantity × coeficiente[referência][etapa]) das bipagens
 *             STAGE_IN do usuário na sua etapa, no período (from..to).
 *
 * 8.37 acrescenta: progresso semanal/mensal (metas de sector_targets ou derivadas),
 * tempo decorrido desde a 1ª bipagem do dia, tempo médio por lote do dia, e `completed`.
 */
export async function computeUserMeta(
  supabase: SupabaseClient,
  userId: string,
  from: string,
  to: string,
): Promise<UserMeta | null> {
  // Fuso do tenant (não UTC): alinha a janela DIÁRIA com as de semana/mês
  // (que já usam dayStartAbs/dayEndAbs) e com kpi-queries. Sem isso, a meta
  // media o dia em UTC e divergia do resto perto da virada da meia-noite.
  const fromStart = dayStartAbs(from);
  const toEnd = dayEndAbs(to);

  // 1) Override explícito do usuário
  const { data: ut } = await supabase
    .from("user_targets")
    .select("stage_id, daily_target, unit")
    .eq("user_id", userId)
    .maybeSingle();

  let stageId: string | null = ut?.stage_id ?? null;
  let target: number | null = ut?.daily_target ?? null;
  let unit: string | null = ut?.unit ?? null;

  // 2) Fallback por setor do perfil.
  // CRÍTICO: a busca de etapa por NOME deve ser escopada pelo tenant do usuário.
  // Sem isso, com múltiplos tenants usando os mesmos nomes de etapa, o nome casa
  // >1 linha → .maybeSingle() dá PGRST116 → stageId null → meta some. Também evita
  // resolver a etapa do tenant errado (vazamento cross-tenant).
  if (!stageId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("sector, tenant_id")
      .eq("id", userId)
      .maybeSingle();
    const sector = (profile?.sector || "").trim();
    if (sector) {
      let stageQuery = supabase.from("stages").select("id").ilike("name", sector);
      if (profile?.tenant_id) stageQuery = stageQuery.eq("tenant_id", profile.tenant_id);
      const { data: stage } = await stageQuery.limit(1).maybeSingle();
      stageId = stage?.id ?? null;
    }
  }

  if (!stageId) return null;

  // Nome da etapa (+ tenant p/ calendário de trabalho)
  const { data: stageRow } = await supabase
    .from("stages")
    .select("name, display_name, tenant_id")
    .eq("id", stageId)
    .maybeSingle();
  const stageName = (stageRow?.display_name as string) || (stageRow?.name as string) || "Setor";

  // Frente 2 — calendário de trabalho do tenant (default seg-sex se não configurado)
  const cal = stageRow?.tenant_id
    ? await getTenantCalendar(supabase, stageRow.tenant_id as string)
    : DEFAULT_CALENDAR;

  // Completa meta/unidade + metas de período pelo sector_target
  const { data: st } = await supabase
    .from("sector_targets")
    .select("daily_target, weekly_target, monthly_target, unit")
    .eq("stage_id", stageId)
    .maybeSingle();
  if (target === null) target = (st?.daily_target as number) ?? null;
  if (unit === null) unit = (st?.unit as string) ?? null;

  // Coeficientes por referência para a etapa
  const { data: coeffs } = await supabase
    .from("reference_stage_targets")
    .select("reference, coefficient")
    .eq("stage_id", stageId);
  const coeffMap = new Map<string, number>(
    (coeffs || []).map((c) => [String(c.reference), Number(c.coefficient) || 1.0]),
  );

  // Janelas de semana/mês ancoradas em `to`
  const wkStart = weekStart(to);
  const moStart = monthStart(to);
  const moEnd = monthEnd(to);

  // Bipagens STAGE_IN do usuário: período (from..to), semana, mês + STAGE_OUT do dia
  const SEL = "scanned_at, lots!inner(quantity, production_orders!inner(reference))";
  // EXCLUI OPs canceladas (status CANCELLED) da meta individual.
  const [dayRes, weekRes, monthRes, outRes] = await Promise.all([
    supabase.from("scan_events").select(SEL).is("disregarded_at", null)
      .eq("user_id", userId).eq("stage_id", stageId).eq("event_type", "STAGE_OUT")
      .neq("lots.production_orders.status", "CANCELLED")
      .gte("scanned_at", fromStart).lte("scanned_at", toEnd),
    supabase.from("scan_events").select(SEL).is("disregarded_at", null)
      .eq("user_id", userId).eq("stage_id", stageId).eq("event_type", "STAGE_OUT")
      .neq("lots.production_orders.status", "CANCELLED")
      .gte("scanned_at", dayStartAbs(wkStart)).lte("scanned_at", dayEndAbs(to)),
    supabase.from("scan_events").select(SEL).is("disregarded_at", null)
      .eq("user_id", userId).eq("stage_id", stageId).eq("event_type", "STAGE_OUT")
      .neq("lots.production_orders.status", "CANCELLED")
      .gte("scanned_at", dayStartAbs(moStart)).lte("scanned_at", dayEndAbs(to)),
    supabase.from("scan_events").select("lot_id, scanned_at").is("disregarded_at", null)
      .eq("user_id", userId).eq("stage_id", stageId).eq("event_type", "STAGE_OUT")
      .gte("scanned_at", fromStart).lte("scanned_at", toEnd),
  ]);

  const dayRows = (dayRes.data || []) as ScanRow[];
  const progress = weightedSum(dayRows, coeffMap);

  // Frente 2.5 — meta efetiva do operador = déficit PERSISTIDO (goal_deficits),
  // MESMO motor do setor: começa zerado (sem fechamento → parte da base). O rollover
  // dinâmico de 30 dias foi REMOVIDO (gerava números desenfreados, ex.: 46.000).
  const persisted = await getActiveDeficits(supabase, userId, to, cal);
  const effTarget = target != null && target > 0 ? accumulatedGoal(target, persisted.daily) : target;
  const dailyDeficit = persisted.daily ?? 0;

  const percent = effTarget && effTarget > 0 ? Math.round((progress / effTarget) * 1000) / 10 : 0;
  const completed = !!(effTarget && effTarget > 0 && progress >= effTarget);

  // Metas de período (cadastradas ou derivadas da diária) + déficit acumulado
  const weeklyBase = (st?.weekly_target as number) ?? (target != null ? target * workingDaysPerWeek(cal) : null);
  const monthlyBase = (st?.monthly_target as number) ?? (target != null ? target * workingDaysBetween(moStart, moEnd, cal) : null);
  const weeklyEstimated = (st?.weekly_target as number) == null;
  const monthlyEstimated = (st?.monthly_target as number) == null;
  const weeklyProgress = weightedSum((weekRes.data || []) as ScanRow[], coeffMap);
  const monthlyProgress = weightedSum((monthRes.data || []) as ScanRow[], coeffMap);
  const weekly: PeriodProgress = {
    target: weeklyBase != null ? accumulatedGoal(weeklyBase, persisted.weekly) : null,
    progress: weeklyProgress,
    estimated: weeklyEstimated,
  };
  const monthly: PeriodProgress = {
    target: monthlyBase != null ? accumulatedGoal(monthlyBase, persisted.monthly) : null,
    progress: monthlyProgress,
    estimated: monthlyEstimated,
  };

  // Tempo decorrido desde a 1ª bipagem do dia
  let elapsedMin: number | null = null;
  if (dayRows.length > 0) {
    const firstAt = dayRows.reduce((min, r) => (r.scanned_at < min ? r.scanned_at : min), dayRows[0].scanned_at);
    elapsedMin = Math.max(0, Math.round((Date.now() - new Date(firstAt).getTime()) / 60000));
  }

  // Tempo médio por lote do dia (pareia 1º IN com 1º OUT por lote — IN já vem do dayRes,
  // mas precisamos do lot_id; refazemos leitura leve com lot_id para o pareamento).
  let avgPerLotMin: number | null = null;
  const outByLot = new Map<string, string>();
  for (const o of (outRes.data || []) as Array<{ lot_id: string; scanned_at: string }>) {
    if (!outByLot.has(o.lot_id) || o.scanned_at < (outByLot.get(o.lot_id) as string)) outByLot.set(o.lot_id, o.scanned_at);
  }
  if (outByLot.size > 0) {
    const { data: inRows } = await supabase.from("scan_events").select("lot_id, scanned_at").is("disregarded_at", null)
      .eq("user_id", userId).eq("stage_id", stageId).eq("event_type", "STAGE_IN")
      .gte("scanned_at", fromStart).lte("scanned_at", toEnd);
    const inByLot = new Map<string, string>();
    for (const r of (inRows || []) as Array<{ lot_id: string; scanned_at: string }>) {
      if (!inByLot.has(r.lot_id) || r.scanned_at < (inByLot.get(r.lot_id) as string)) inByLot.set(r.lot_id, r.scanned_at);
    }
    const durations: number[] = [];
    for (const [lotId, inAt] of Array.from(inByLot)) {
      const outAt = outByLot.get(lotId);
      if (outAt) {
        const mins = (new Date(outAt).getTime() - new Date(inAt).getTime()) / 60000;
        if (mins >= 0) durations.push(mins);
      }
    }
    if (durations.length > 0) avgPerLotMin = Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10;
  }

  return {
    stage_id: stageId,
    stage_name: stageName,
    target: effTarget || target,
    unit,
    progress,
    percent,
    weekly,
    monthly,
    elapsed_since_first_scan_min: elapsedMin,
    avg_per_lot_min: avgPerLotMin,
    completed,
    deficits: {
      daily: Math.round(dailyDeficit || 0),
      weekly: Math.round(persisted.weekly ?? 0),
      monthly: Math.round(persisted.monthly ?? 0),
    },
  };
}

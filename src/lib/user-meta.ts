import type { SupabaseClient } from "@supabase/supabase-js";
import { TENANT_UTC_OFFSET } from "@/lib/tz";

export interface PeriodProgress {
  target: number | null;
  progress: number;
  estimated: boolean; // true = derivada da diária (não cadastrada)
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
}

const BUSINESS_DAYS_PER_WEEK = 5;

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
function businessDaysBetween(fromDate: string, toDate: string): number {
  const start = new Date(`${fromDate}T12:00:00.000Z`);
  const end = new Date(`${toDate}T12:00:00.000Z`);
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const dow = cur.getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
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
  const fromStart = `${from}T00:00:00.000Z`;
  const toEnd = `${to}T23:59:59.999Z`;

  // 1) Override explícito do usuário
  const { data: ut } = await supabase
    .from("user_targets")
    .select("stage_id, daily_target, unit")
    .eq("user_id", userId)
    .maybeSingle();

  let stageId: string | null = ut?.stage_id ?? null;
  let target: number | null = ut?.daily_target ?? null;
  let unit: string | null = ut?.unit ?? null;

  // 2) Fallback por setor do perfil
  if (!stageId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("sector")
      .eq("id", userId)
      .maybeSingle();
    const sector = (profile?.sector || "").trim();
    if (sector) {
      const { data: stage } = await supabase
        .from("stages")
        .select("id")
        .ilike("name", sector)
        .maybeSingle();
      stageId = stage?.id ?? null;
    }
  }

  if (!stageId) return null;

  // Nome da etapa
  const { data: stageRow } = await supabase
    .from("stages")
    .select("name, display_name")
    .eq("id", stageId)
    .maybeSingle();
  const stageName = (stageRow?.display_name as string) || (stageRow?.name as string) || "Setor";

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
  const [dayRes, weekRes, monthRes, outRes] = await Promise.all([
    supabase.from("scan_events").select(SEL)
      .eq("user_id", userId).eq("stage_id", stageId).eq("event_type", "STAGE_IN")
      .gte("scanned_at", fromStart).lte("scanned_at", toEnd),
    supabase.from("scan_events").select(SEL)
      .eq("user_id", userId).eq("stage_id", stageId).eq("event_type", "STAGE_IN")
      .gte("scanned_at", dayStartAbs(wkStart)).lte("scanned_at", dayEndAbs(to)),
    supabase.from("scan_events").select(SEL)
      .eq("user_id", userId).eq("stage_id", stageId).eq("event_type", "STAGE_IN")
      .gte("scanned_at", dayStartAbs(moStart)).lte("scanned_at", dayEndAbs(to)),
    supabase.from("scan_events").select("lot_id, scanned_at")
      .eq("user_id", userId).eq("stage_id", stageId).eq("event_type", "STAGE_OUT")
      .gte("scanned_at", fromStart).lte("scanned_at", toEnd),
  ]);

  const dayRows = (dayRes.data || []) as ScanRow[];
  const progress = weightedSum(dayRows, coeffMap);
  const percent = target && target > 0 ? Math.round((progress / target) * 1000) / 10 : 0;
  const completed = !!(target && target > 0 && progress >= target);

  // Metas de período (cadastradas ou derivadas da diária)
  const weeklyTarget = (st?.weekly_target as number) ?? null;
  const monthlyTarget = (st?.monthly_target as number) ?? null;
  const weeklyProgress = weightedSum((weekRes.data || []) as ScanRow[], coeffMap);
  const monthlyProgress = weightedSum((monthRes.data || []) as ScanRow[], coeffMap);
  const weekly: PeriodProgress = weeklyTarget != null
    ? { target: weeklyTarget, progress: weeklyProgress, estimated: false }
    : { target: target != null ? target * BUSINESS_DAYS_PER_WEEK : null, progress: weeklyProgress, estimated: true };
  const monthly: PeriodProgress = monthlyTarget != null
    ? { target: monthlyTarget, progress: monthlyProgress, estimated: false }
    : { target: target != null ? target * businessDaysBetween(moStart, moEnd) : null, progress: monthlyProgress, estimated: true };

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
    const { data: inRows } = await supabase.from("scan_events").select("lot_id, scanned_at")
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
    target,
    unit,
    progress,
    percent,
    weekly,
    monthly,
    elapsed_since_first_scan_min: elapsedMin,
    avg_per_lot_min: avgPerLotMin,
    completed,
  };
}

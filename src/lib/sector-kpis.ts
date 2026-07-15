import type { SupabaseClient } from "@supabase/supabase-js";
import { TENANT_UTC_OFFSET, todayInTz } from "@/lib/tz";
import { getActiveSectorDeficit, accumulatedGoal } from "@/lib/goal-deficits";
import { getTenantCalendar, workingDaysBetween, workingDaysPerWeek } from "@/lib/work-calendar";

/**
 * Épico Metas/KPIs por Setor — cálculo de KPIs de um setor (= Stage) para a TV.
 *
 * Reaproveita o mesmo modelo da meta por usuário (8.21):
 *   produção do setor = Σ (lots.quantity × coeficiente[referência][etapa]) das
 *   bipagens STAGE_IN naquele stage, dedupe por lote, na janela.
 *
 * Metas por período (semanal/mensal): usa sector_targets.weekly/monthly_target;
 * quando NULL, deriva da diária × dias úteis (marcado como `estimated`).
 */

export interface PeriodKpi {
  target: number | null;
  progress: number;
  estimated: boolean; // true = meta derivada da diária (não cadastrada)
}

export interface FactionStatus {
  status: "on_time" | "at_risk" | "late";
  faction_name: string;
  expected_return_at: string;
  hours_remaining: number; // negativo = atrasado
}

export interface HourlyPoint {
  label: string; // "08h"
  value: number; // produção ponderada na hora (hoje)
  value_prev?: number | null; // mesma hora ONTEM (null/ausente nas horas futuras p/ não desenhar)
}

export interface TopCollaborator {
  name: string;
  produced: number; // produção ponderada hoje no setor
  pct: number; // relativo ao 1º colocado (0–100)
}

export interface SectorKpis {
  stage_id: string;
  stage_name: string;
  unit: string | null;
  produced: number;
  daily_target: number | null;
  distance_daily: number; // quanto falta p/ meta diária (0 se batida)
  percent: number;
  weekly: PeriodKpi;
  monthly: PeriodKpi;
  elapsed_since_first_scan_min: number | null; // min desde a 1ª bipagem do dia
  avg_per_lot_min: number | null; // tempo médio por lote do dia (STAGE_IN→OUT)
  faction_status: FactionStatus | null;
  hourly: HourlyPoint[]; // produção por hora (últimas 8h) — ChartWidget
  top_collaborators: TopCollaborator[]; // top 3 do setor hoje — RankingWidget
}

/** Limites absolutos (timestamptz) de uma data local YYYY-MM-DD. */
function dayStart(date: string) {
  return `${date}T00:00:00.000${TENANT_UTC_OFFSET}`;
}
function dayEnd(date: string) {
  return `${date}T23:59:59.999${TENANT_UTC_OFFSET}`;
}

/** Segunda-feira da semana que contém `date` (YYYY-MM-DD). */
function weekStart(date: string): string {
  const d = new Date(`${date}T12:00:00.000Z`);
  const dow = d.getUTCDay(); // 0=dom..6=sáb
  const diff = dow === 0 ? 6 : dow - 1; // dias desde segunda
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

/** Primeiro dia do mês de `date`. */
function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

interface ScanLotRow {
  lot_id: string;
  scanned_at: string;
  lots:
    | { quantity: number | string | null; production_orders: { reference: string | null } | { reference: string | null }[] }
    | { quantity: number | string | null; production_orders: { reference: string | null } | { reference: string | null }[] }[]
    | null;
}

/** Soma ponderada (dedupe por lote) de uma lista de scans STAGE_IN. */
function weightedSum(rows: ScanLotRow[], coeffMap: Map<string, number>): number {
  let total = 0;
  const seen = new Set<string>();
  for (const s of rows) {
    if (seen.has(s.lot_id)) continue;
    seen.add(s.lot_id);
    const lotRel = s.lots;
    const lot = (Array.isArray(lotRel) ? lotRel[0] : lotRel) as ScanLotRow["lots"] extends Array<infer T> ? T : never;
    const qty = Number((lot as { quantity?: number | string | null })?.quantity) || 0;
    const poRel = (lot as { production_orders?: unknown })?.production_orders;
    const po = (Array.isArray(poRel) ? poRel[0] : poRel) as { reference: string | null } | null;
    const coef = coeffMap.get(po?.reference ?? "") ?? 1.0;
    total += qty * coef;
  }
  return Math.round(total * 10) / 10;
}

const SCAN_SELECT = "lot_id, scanned_at, lots!inner(quantity, production_orders!inner(reference, tenant_id))";
const SCAN_SELECT_DAY = "lot_id, user_id, scanned_at, lots!inner(quantity, production_orders!inner(reference, tenant_id))";

type DayScanRow = ScanLotRow & { user_id: string | null };

/** Hora local (São Paulo, offset fixo -03:00) de um timestamp ISO. */
function localHour(iso: string): number {
  return (new Date(iso).getUTCHours() - 3 + 24) % 24;
}

/**
 * Calcula os KPIs de um setor. `tenantId` vem do token de kiosk (service_role).
 */
export async function computeSectorKpis(
  supabase: SupabaseClient,
  tenantId: string,
  stageId: string,
): Promise<SectorKpis | null> {
  // Stage
  const { data: stage } = await supabase
    .from("stages")
    .select("id, name, display_name, type")
    .eq("id", stageId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!stage) return null;
  const stageName = (stage.display_name as string) || (stage.name as string) || "Setor";

  // Frente 2 — calendário de trabalho do tenant (default seg-sex)
  const cal = await getTenantCalendar(supabase, tenantId);

  const today = todayInTz();
  const yesterday = (() => {
    const d = new Date(`${today}T12:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();
  const wkStart = weekStart(today);
  const moStart = monthStart(today);

  // Metas do setor
  const { data: st } = await supabase
    .from("sector_targets")
    .select("daily_target, weekly_target, monthly_target, unit")
    .eq("tenant_id", tenantId)
    .eq("stage_id", stageId)
    .maybeSingle();
  const dailyTarget = (st?.daily_target as number) ?? null;
  const unit = (st?.unit as string) ?? null;

  // Coeficientes referência×etapa
  const { data: coeffs } = await supabase
    .from("reference_stage_targets")
    .select("reference, coefficient")
    .eq("stage_id", stageId);
  const coeffMap = new Map<string, number>(
    (coeffs || []).map((c) => [String(c.reference), Number(c.coefficient) || 1.0]),
  );

  // Story 9.2 — PRODUÇÃO conta no FIM do lote (STAGE_OUT), não no início.
  // Bipagens STAGE_OUT do setor (dia, semana, mês, ontem) = produção concluída.
  // Uma query STAGE_IN do dia serve só para medir tempo (início dos lotes).
  // EXCLUI OPs canceladas (status CANCELLED) de toda agregação de produção.
  const [dayScans, weekScans, monthScans, dayInScans, ydayScans] = await Promise.all([
    supabase.from("scan_events").select(SCAN_SELECT_DAY)
      .eq("stage_id", stageId).eq("event_type", "STAGE_OUT")
      .neq("lots.production_orders.status", "CANCELLED")
      .gte("scanned_at", dayStart(today)).lte("scanned_at", dayEnd(today)),
    supabase.from("scan_events").select(SCAN_SELECT)
      .eq("stage_id", stageId).eq("event_type", "STAGE_OUT")
      .neq("lots.production_orders.status", "CANCELLED")
      .gte("scanned_at", dayStart(wkStart)).lte("scanned_at", dayEnd(today)),
    supabase.from("scan_events").select(SCAN_SELECT)
      .eq("stage_id", stageId).eq("event_type", "STAGE_OUT")
      .neq("lots.production_orders.status", "CANCELLED")
      .gte("scanned_at", dayStart(moStart)).lte("scanned_at", dayEnd(today)),
    // STAGE_IN do dia p/ tempo médio por lote (início) e "tempo decorrido"
    supabase.from("scan_events").select("lot_id, scanned_at")
      .eq("stage_id", stageId).eq("event_type", "STAGE_IN")
      .gte("scanned_at", dayStart(today)).lte("scanned_at", dayEnd(today)),
    // ONTEM (produção concluída) p/ a onda comparativa do gráfico
    supabase.from("scan_events").select(SCAN_SELECT)
      .eq("stage_id", stageId).eq("event_type", "STAGE_OUT")
      .neq("lots.production_orders.status", "CANCELLED")
      .gte("scanned_at", dayStart(yesterday)).lte("scanned_at", dayEnd(yesterday)),
  ]);

  // dayRows = STAGE_OUT (produção do dia); dayInRows = STAGE_IN (início, p/ tempo)
  const dayRows = (dayScans.data || []) as DayScanRow[];
  const dayInRows = (dayInScans.data || []) as Array<{ lot_id: string; scanned_at: string }>;

  // Épico Metas por Setor — meta efetiva com déficit PERSISTIDO (goal_deficits,
  // scope='SECTOR'). É o MESMO livro do operador; o cron (goal-closures) alimenta a
  // dívida do setor. Sem fallback dinâmico de propósito: é o que garante "começa
  // zerado" (sem fechamento persistido → parte da base) e "não esquece" (a cadeia
  // de déficit é perpétua, sem a janela de 30 dias do rollover antigo).
  const persisted = await getActiveSectorDeficit(supabase, tenantId, stageId, today, cal);
  const effectiveTarget = dailyTarget != null ? accumulatedGoal(dailyTarget, persisted.daily) : null;
  const produced = weightedSum(dayRows, coeffMap);
  const weeklyProgress = weightedSum((weekScans.data || []) as ScanLotRow[], coeffMap);
  const monthlyProgress = weightedSum((monthScans.data || []) as ScanLotRow[], coeffMap);

  // Story 9.3 — distância/percentual usam a meta EFETIVA (com rollover)
  const distanceDaily = effectiveTarget && effectiveTarget > 0 ? Math.max(0, Math.round((effectiveTarget - produced) * 10) / 10) : 0;
  const percent = effectiveTarget && effectiveTarget > 0 ? Math.round((produced / effectiveTarget) * 1000) / 10 : 0;

  // Metas de período (cadastradas ou derivadas)
  const weeklyTarget = (st?.weekly_target as number) ?? null;
  const monthlyTarget = (st?.monthly_target as number) ?? null;
  const weekly: PeriodKpi = weeklyTarget != null
    ? { target: weeklyTarget, progress: weeklyProgress, estimated: false }
    : { target: dailyTarget != null ? dailyTarget * workingDaysPerWeek(cal) : null, progress: weeklyProgress, estimated: true };
  const monthDays = workingDaysBetween(moStart, `${today.slice(0, 7)}-${String(new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate()).padStart(2, "0")}`, cal);
  const monthly: PeriodKpi = monthlyTarget != null
    ? { target: monthlyTarget, progress: monthlyProgress, estimated: false }
    : { target: dailyTarget != null ? dailyTarget * monthDays : null, progress: monthlyProgress, estimated: true };

  // Tempo decorrido desde a 1ª bipagem (início) do dia
  let elapsedMin: number | null = null;
  if (dayInRows.length > 0) {
    const firstAt = dayInRows.reduce((min, r) => (r.scanned_at < min ? r.scanned_at : min), dayInRows[0].scanned_at);
    elapsedMin = Math.max(0, Math.round((Date.now() - new Date(firstAt).getTime()) / 60000));
  }

  // Tempo médio por lote (pareia 1º IN do dia [início] com 1º OUT do dia [fim] por lote)
  let avgPerLotMin: number | null = null;
  const outByLot = new Map<string, string>();
  for (const o of dayRows) {
    if (!outByLot.has(o.lot_id) || o.scanned_at < (outByLot.get(o.lot_id) as string)) {
      outByLot.set(o.lot_id, o.scanned_at);
    }
  }
  const inByLot = new Map<string, string>();
  for (const r of dayInRows) {
    if (!inByLot.has(r.lot_id) || r.scanned_at < (inByLot.get(r.lot_id) as string)) {
      inByLot.set(r.lot_id, r.scanned_at);
    }
  }
  const durations: number[] = [];
  for (const [lotId, inAt] of Array.from(inByLot)) {
    const outAt = outByLot.get(lotId);
    if (outAt) {
      const mins = (new Date(outAt).getTime() - new Date(inAt).getTime()) / 60000;
      if (mins >= 0) durations.push(mins);
    }
  }
  if (durations.length > 0) {
    avgPerLotMin = Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10;
  }

  // Produção ponderada de uma linha de scan (qty × coeficiente da referência)
  const rowWeighted = (r: ScanLotRow): number => {
    const lotRel = r.lots;
    const lot = (Array.isArray(lotRel) ? lotRel[0] : lotRel) as { quantity?: number | string | null; production_orders?: unknown } | null;
    const qty = Number(lot?.quantity) || 0;
    const poRel = lot?.production_orders;
    const po = (Array.isArray(poRel) ? poRel[0] : poRel) as { reference: string | null } | null;
    return qty * (coeffMap.get(po?.reference ?? "") ?? 1.0);
  };

  // ── Produção por hora (8.43): dedupe por lote (1ª bipagem) → bucket por hora local ──
  const firstByLot = new Map<string, { at: string; weighted: number }>();
  for (const r of dayRows) {
    const prev = firstByLot.get(r.lot_id);
    if (!prev || r.scanned_at < prev.at) firstByLot.set(r.lot_id, { at: r.scanned_at, weighted: rowWeighted(r) });
  }
  const hourBucket = new Map<number, number>();
  for (const { at, weighted } of Array.from(firstByLot.values())) {
    const h = localHour(at);
    hourBucket.set(h, (hourBucket.get(h) || 0) + weighted);
  }
  // ONTEM: mesmo dedupe por lote → bucket por hora local
  const ydayRows = (ydayScans.data || []) as ScanLotRow[];
  const firstByLotYday = new Map<string, { at: string; weighted: number }>();
  for (const r of ydayRows) {
    const prev = firstByLotYday.get(r.lot_id);
    if (!prev || r.scanned_at < prev.at) firstByLotYday.set(r.lot_id, { at: r.scanned_at, weighted: rowWeighted(r) });
  }
  const hourBucketYday = new Map<number, number>();
  for (const { at, weighted } of Array.from(firstByLotYday.values())) {
    const h = localHour(at);
    hourBucketYday.set(h, (hourBucketYday.get(h) || 0) + weighted);
  }
  const nowHour = (new Date().getUTCHours() - 3 + 24) % 24;
  const hourly: HourlyPoint[] = [];
  for (let i = 7; i >= 0; i--) {
    const h = (nowHour - i + 24) % 24;
    hourly.push({
      label: `${String(h).padStart(2, "0")}h`,
      value: Math.round((hourBucket.get(h) || 0) * 10) / 10,
      value_prev: Math.round((hourBucketYday.get(h) || 0) * 10) / 10,
    });
  }

  // ── Top colaboradores (8.43): produção ponderada por usuário, dedupe por lote/usuário ──
  const perUser = new Map<string, { weighted: number; seen: Set<string> }>();
  for (const r of dayRows) {
    const uid = r.user_id;
    if (!uid) continue;
    let agg = perUser.get(uid);
    if (!agg) { agg = { weighted: 0, seen: new Set() }; perUser.set(uid, agg); }
    if (agg.seen.has(r.lot_id)) continue;
    agg.seen.add(r.lot_id);
    agg.weighted += rowWeighted(r);
  }
  const ranked = Array.from(perUser.entries())
    .map(([id, a]) => ({ id, produced: Math.round(a.weighted * 10) / 10 }))
    .sort((a, b) => b.produced - a.produced)
    .slice(0, 3);
  let nameById = new Map<string, string>();
  if (ranked.length > 0) {
    const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ranked.map((r) => r.id));
    nameById = new Map((profs || []).map((p: { id: string; full_name: string }) => [p.id, p.full_name]));
  }
  const topProduced = ranked[0]?.produced || 0;
  const topCollaborators: TopCollaborator[] = ranked.map((r) => ({
    name: nameById.get(r.id) || "Colaborador",
    produced: r.produced,
    pct: topProduced > 0 ? Math.round((r.produced / topProduced) * 100) : 0,
  }));

  // Status da facção (quando há remessa vigente do tenant — surfacing da mais urgente)
  const factionStatus = await computeFactionStatus(supabase, tenantId);

  return {
    stage_id: stageId,
    stage_name: stageName,
    unit,
    produced,
    daily_target: effectiveTarget || dailyTarget,
    distance_daily: distanceDaily,
    percent,
    weekly,
    monthly,
    elapsed_since_first_scan_min: elapsedMin,
    avg_per_lot_min: avgPerLotMin,
    faction_status: factionStatus,
    hourly,
    top_collaborators: topCollaborators,
  };
}

/**
 * Remessa vigente mais urgente do tenant → status de prazo.
 * Sem vínculo stage→facção no schema; surfacing tenant-level (null = nada vigente → UI esconde).
 */
async function computeFactionStatus(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<FactionStatus | null> {
  const { data } = await supabase
    .from("faction_shipments")
    .select("expected_return_at, status, factions!inner ( name, tenant_id )")
    .eq("factions.tenant_id", tenantId)
    .not("status", "in", "(RETURNED,PARTIALLY_RETURNED)")
    .not("expected_return_at", "is", null)
    .order("expected_return_at", { ascending: true })
    .limit(1);

  const row = (data || [])[0] as
    | { expected_return_at: string; factions: { name: string } | { name: string }[] }
    | undefined;
  if (!row) return null;

  const factionRel = row.factions;
  const faction = (Array.isArray(factionRel) ? factionRel[0] : factionRel) as { name: string } | null;
  const hoursRemaining = Math.round(((new Date(row.expected_return_at).getTime() - Date.now()) / 3_600_000) * 10) / 10;

  let status: FactionStatus["status"];
  if (hoursRemaining < 0) status = "late";
  else if (hoursRemaining <= 24) status = "at_risk";
  else status = "on_time";

  return {
    status,
    faction_name: faction?.name || "Facção",
    expected_return_at: row.expected_return_at,
    hours_remaining: hoursRemaining,
  };
}

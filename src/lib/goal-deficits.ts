import type { SupabaseClient } from "@supabase/supabase-js";
import { prevWorkingDay, DEFAULT_CALENDAR, type WorkCalendar } from "@/lib/work-calendar";

/**
 * Metas acumulativas persistidas (épico Metas — evolução da Story 9.3).
 *
 * goal_deficits guarda o fechamento de cada período por usuário:
 *   deficit = MAX(0, meta_efetiva − produzido)
 * Déficit vigente = linha do período IMEDIATAMENTE anterior (a cadeia se
 * preserva por indução: a meta efetiva daquele período já embutia o déficit
 * anterior a ele). Meta acumulada = base + COALESCE(déficit_anterior, 0).
 */

export type PeriodType = "daily" | "weekly" | "monthly";

export interface ActiveDeficits {
  /** Déficit do último dia útil fechado; null = sem fechamento persistido. */
  daily: number | null;
  weekly: number | null;
  monthly: number | null;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Último dia ÚTIL do tenant estritamente anterior a `today` (calendário do tenant;
 *  default seg-sex mantém o comportamento legado). */
export function prevBusinessDay(today: string, cal: WorkCalendar = DEFAULT_CALENDAR): string {
  return prevWorkingDay(today, cal);
}

export function weekStartOf(date: string): string {
  const d = new Date(`${date}T12:00:00.000Z`);
  const dow = d.getUTCDay();
  const diff = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

export function monthStartOf(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** Início da semana ANTERIOR à semana de `today`. */
export function prevWeekStart(today: string): string {
  return addDays(weekStartOf(today), -7);
}

/** Início do mês ANTERIOR ao mês de `today`. */
export function prevMonthStart(today: string): string {
  const first = monthStartOf(today);
  const d = new Date(`${first}T12:00:00.000Z`);
  d.setUTCDate(0); // último dia do mês anterior
  return monthStartOf(d.toISOString().slice(0, 10));
}

/** Meta acumulada = base + déficit vigente. */
export function accumulatedGoal(base: number, deficit: number | null): number {
  return base + (deficit ?? 0);
}

/**
 * Busca em 1 query os déficits vigentes das 3 granularidades para o usuário.
 * null = período anterior não tem fechamento persistido (caller decide o
 * fallback — ex.: rollover dinâmico da Story 9.3 para a diária).
 */
export async function getActiveDeficits(
  supabase: SupabaseClient,
  userId: string,
  today: string,
  cal: WorkCalendar = DEFAULT_CALENDAR,
): Promise<ActiveDeficits> {
  const refs: Array<{ type: PeriodType; ref: string }> = [
    { type: "daily", ref: prevBusinessDay(today, cal) },
    { type: "weekly", ref: prevWeekStart(today) },
    { type: "monthly", ref: prevMonthStart(today) },
  ];

  const { data } = await supabase
    .from("goal_deficits")
    .select("period_type, period_reference, deficit")
    .eq("user_id", userId)
    .in("period_type", refs.map((r) => r.type))
    .in("period_reference", refs.map((r) => r.ref));

  const result: ActiveDeficits = { daily: null, weekly: null, monthly: null };
  for (const row of data || []) {
    const match = refs.find(
      (r) => r.type === row.period_type && r.ref === String(row.period_reference).slice(0, 10),
    );
    if (match) result[match.type] = Number(row.deficit) || 0;
  }
  return result;
}

/**
 * Déficits vigentes de um SETOR (stage) — espelho de getActiveDeficits, mas para
 * as linhas scope='SECTOR' (user_id NULL, stage_id preenchido). Alimenta a meta
 * acumulada da TV de setor (mesmo livro persistido do operador).
 */
export async function getActiveSectorDeficit(
  supabase: SupabaseClient,
  tenantId: string,
  stageId: string,
  today: string,
  cal: WorkCalendar = DEFAULT_CALENDAR,
): Promise<ActiveDeficits> {
  const refs: Array<{ type: PeriodType; ref: string }> = [
    { type: "daily", ref: prevBusinessDay(today, cal) },
    { type: "weekly", ref: prevWeekStart(today) },
    { type: "monthly", ref: prevMonthStart(today) },
  ];

  const { data } = await supabase
    .from("goal_deficits")
    .select("period_type, period_reference, deficit")
    .eq("scope", "SECTOR")
    .eq("tenant_id", tenantId)
    .eq("stage_id", stageId)
    .in("period_type", refs.map((r) => r.type))
    .in("period_reference", refs.map((r) => r.ref));

  const result: ActiveDeficits = { daily: null, weekly: null, monthly: null };
  for (const row of data || []) {
    const match = refs.find(
      (r) => r.type === row.period_type && r.ref === String(row.period_reference).slice(0, 10),
    );
    if (match) result[match.type] = Number(row.deficit) || 0;
  }
  return result;
}

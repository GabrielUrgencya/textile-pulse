import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Frente 2 — Calendário de trabalho por empresa (tenant).
 *
 * Cada tenant define seus dias úteis em tenants.settings.work_days (0=Dom..6=Sáb).
 * Default = seg-sex ([1,2,3,4,5]) → tenant sem configuração se comporta como antes.
 * Feriados (settings.holidays: YYYY-MM-DD) são exceções não-úteis pontuais.
 *
 * Substitui o "dia útil" hardcoded (seg-sex global) espalhado pelo sistema.
 */

export interface WorkCalendar {
  workDays: Set<number>; // dias da semana úteis (0=Dom..6=Sáb)
  holidays: Set<string>; // YYYY-MM-DD não-úteis (exceções)
}

const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5];

/** Calendário seg-sex (comportamento legado / fallback). */
export const DEFAULT_CALENDAR: WorkCalendar = {
  workDays: new Set(DEFAULT_WORK_DAYS),
  holidays: new Set<string>(),
};

/** Deriva o calendário a partir de tenants.settings (defaults seg-sex se ausente/inválido). */
export function parseCalendar(settings: unknown): WorkCalendar {
  const s = (settings ?? {}) as { work_days?: unknown; holidays?: unknown };
  const raw = s.work_days;
  const valid =
    Array.isArray(raw) &&
    raw.length > 0 &&
    raw.every((d) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6);
  const workDays = new Set<number>(valid ? (raw as number[]) : DEFAULT_WORK_DAYS);

  const hraw = s.holidays;
  const holidays = new Set<string>(
    Array.isArray(hraw) ? hraw.filter((h): h is string => typeof h === "string" && /^\d{4}-\d{2}-\d{2}$/.test(h)) : [],
  );
  return { workDays, holidays };
}

/** Lê o calendário do tenant (tenants.settings). */
export async function getTenantCalendar(supabase: SupabaseClient, tenantId: string): Promise<WorkCalendar> {
  const { data } = await supabase.from("tenants").select("settings").eq("id", tenantId).maybeSingle();
  return parseCalendar(data?.settings);
}

function dowOf(dateStr: string): number {
  return new Date(`${dateStr}T12:00:00.000Z`).getUTCDay();
}
function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Dia é útil para o tenant: dia da semana marcado E não é feriado. */
export function isWorkingDay(dateStr: string, cal: WorkCalendar = DEFAULT_CALENDAR): boolean {
  return cal.workDays.has(dowOf(dateStr)) && !cal.holidays.has(dateStr);
}

/** Dia útil imediatamente anterior a `today` (pula fins de semana/feriados do tenant). */
export function prevWorkingDay(today: string, cal: WorkCalendar = DEFAULT_CALENDAR): string {
  let cur = addDays(today, -1);
  let guard = 0;
  while (!isWorkingDay(cur, cal) && guard < 31) {
    cur = addDays(cur, -1);
    guard++;
  }
  return cur;
}

/** Conta dias úteis (do tenant) entre from e to inclusive. */
export function workingDaysBetween(fromDate: string, toDate: string, cal: WorkCalendar = DEFAULT_CALENDAR): number {
  let count = 0;
  let cur = fromDate;
  let guard = 0;
  while (cur <= toDate && guard < 3660) {
    if (isWorkingDay(cur, cal)) count++;
    cur = addDays(cur, 1);
    guard++;
  }
  return count;
}

/** Quantidade de dias úteis por semana do tenant (para derivar meta semanal). */
export function workingDaysPerWeek(cal: WorkCalendar = DEFAULT_CALENDAR): number {
  return cal.workDays.size;
}

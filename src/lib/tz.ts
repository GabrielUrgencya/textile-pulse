/**
 * Story 8.29 — utilitários de fuso do tenant.
 *
 * O "dia" operacional segue o fuso do tenant (default America/Sao_Paulo).
 * São Paulo é UTC−3 o ano todo (sem horário de verão desde 2019), então o
 * início do dia local 00:00 corresponde a 03:00 UTC. Usamos o offset fixo
 * para converter os limites do dia local em timestamps absolutos (timestamptz).
 */

export const TENANT_TZ = "America/Sao_Paulo";
/** Offset fixo de São Paulo (sem DST). */
export const TENANT_UTC_OFFSET = "-03:00";

/** Data "hoje" (YYYY-MM-DD) no fuso do tenant. */
export function todayInTz(tz: string = TENANT_TZ): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Início do dia local (YYYY-MM-DD) como ISO absoluto (timestamptz). */
export function localDayStart(date: string): string {
  return `${date}T00:00:00.000${TENANT_UTC_OFFSET}`;
}

/** Fim do dia local (YYYY-MM-DD) como ISO absoluto (timestamptz). */
export function localDayEnd(date: string): string {
  return `${date}T23:59:59.999${TENANT_UTC_OFFSET}`;
}

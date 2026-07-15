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

/**
 * Formata uma data (timestamptz) SEMPRE no fuso do tenant — independente do
 * fuso do runtime (Vercel roda em UTC). Evita o off-by-one de dia na exibição.
 * Retorna "—" para nulo/inválido.
 */
export function formatDateBR(value: string | number | Date | null | undefined): string {
  if (value == null || value === "") return "—";
  // Coluna `date` (data pura "YYYY-MM-DD") NÃO tem fuso — formatar direto, sem
  // converter (senão new Date() a trata como meia-noite UTC e "volta" um dia).
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-");
    return `${d}/${m}/${y}`;
  }
  // timestamptz (instante) → formatar no fuso do tenant.
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { timeZone: TENANT_TZ });
}

/** Data + hora no fuso do tenant (dd/mm/aa hh:mm). "—" para nulo/inválido. */
export function formatDateTimeBR(value: string | number | Date | null | undefined): string {
  if (value == null || value === "") return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    timeZone: TENANT_TZ,
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

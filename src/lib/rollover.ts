/**
 * Story 9.3 — Rollover CUMULATIVO da meta (déficit acumula até zerar).
 *
 * meta_efetiva(hoje) = base + backlog_até_ontem
 * backlog_após(dia)  = max(0, base + backlog_antes − produzido_no_dia)
 *   → "excedente ignorado": produzir a mais só zera o backlog (piso 0), não gera crédito.
 *
 * Cálculo on-the-fly, LIMITADO a uma janela (LOOKBACK_DAYS) para custo previsível
 * no piloto. Endurecimento futuro: snapshot diário persistido (auditável) — ver 9.3.
 * Considera apenas DIAS ÚTEIS (seg–sex); fim de semana não penaliza.
 */

const LOOKBACK_DAYS = 30;

/** YYYY-MM-DD local (fuso São Paulo, -03:00) de um timestamp ISO. */
export function localDay(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 3 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function isBusinessDay(dateStr: string): boolean {
  const dow = new Date(`${dateStr}T12:00:00.000Z`).getUTCDay();
  return dow !== 0 && dow !== 6;
}

/** Data inicial da janela de rollover (para consultar produção passada). */
export function rolloverStart(today: string): string {
  return addDays(today, -LOOKBACK_DAYS);
}

export interface RolloverResult {
  effective: number; // meta efetiva de hoje (base + backlog)
  backlog: number; // pendência acumulada trazida dos dias anteriores
  base: number; // meta base cadastrada
}

/**
 * Calcula a meta efetiva de HOJE a partir da meta base e da produção por dia
 * (STAGE_OUT ponderado) dos dias anteriores.
 * @param producedByDay Map<YYYY-MM-DD, produção ponderada do dia>
 */
export function effectiveDailyTarget(
  base: number | null,
  producedByDay: Map<string, number>,
  today: string,
): RolloverResult {
  if (!base || base <= 0) return { effective: base ?? 0, backlog: 0, base: base ?? 0 };
  let backlog = 0;
  const yesterday = addDays(today, -1);
  let cur = rolloverStart(today);
  while (cur <= yesterday) {
    if (isBusinessDay(cur)) {
      const prod = producedByDay.get(cur) ?? 0;
      const eff = base + backlog;
      backlog = Math.max(0, eff - prod);
    }
    cur = addDays(cur, 1);
  }
  return {
    effective: Math.round((base + backlog) * 10) / 10,
    backlog: Math.round(backlog * 10) / 10,
    base,
  };
}

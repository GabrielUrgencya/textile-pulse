/**
 * Frente 4 — Redesign "Instrumento" da TV.
 *
 * Estado responsivo por RITMO: a cor responde antes do número (regra de leitura
 * a 5 m). Mapeado pelo `percent` da meta acumulada efetiva (mesma métrica do
 * motor unificado — computeSectorKpis). Ajustável aqui, num só lugar.
 *
 *   emerald  = no ritmo / meta batida   (>= 100%)
 *   amber    = atenção                  (70–99%)
 *   red      = abaixo                   (< 70%)
 */

export type PaceState = "on" | "warn" | "below";

export function paceFromPercent(percent: number): PaceState {
  if (percent >= 100) return "on";
  if (percent >= 70) return "warn";
  return "below";
}

/**
 * Frente 3 — cor do anel da META POR HORA (decisão do Gabriel):
 *   < 60%   = vermelho (abaixo)
 *   60–89%  = amarelo (atenção)
 *   >= 90%  = verde (quase batendo / batida)
 */
export function paceFromHourPercent(percent: number): PaceState {
  if (percent >= 90) return "on";
  if (percent >= 60) return "warn";
  return "below";
}

/** Dourado da celebração "hora batida" (>= 100%). */
export const HOUR_HIT_GOLD = { main: "#ffd76a", glow: "rgba(255,215,106,0.6)", soft: "rgba(255,215,106,0.14)" };

export interface StateColor {
  main: string; // cor sólida (arco, %, dot)
  light: string; // realce do gradiente
  glow: string; // brilho ambiente / text-shadow
  soft: string; // preenchimento translúcido (pills, área da onda)
  label: string; // rótulo do estado
}

/** Cores-sinal, alinhadas às semânticas do `.tv-premium` (globals.css). */
export const STATE_COLORS: Record<PaceState, StateColor> = {
  on: { main: "#10b981", light: "#34d399", glow: "rgba(16,185,129,0.55)", soft: "rgba(16,185,129,0.14)", label: "NO RITMO" },
  warn: { main: "#f59e0b", light: "#fbbf24", glow: "rgba(245,158,11,0.50)", soft: "rgba(245,158,11,0.14)", label: "ATENÇÃO" },
  below: { main: "#ef4444", light: "#f87171", glow: "rgba(239,68,68,0.50)", soft: "rgba(239,68,68,0.14)", label: "ABAIXO DO RITMO" },
};

/** Formatação pt-BR compartilhada (milhar; até 1 casa). */
export function nf(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

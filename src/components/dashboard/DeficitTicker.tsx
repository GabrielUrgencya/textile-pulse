"use client";

import * as React from "react";
import { AlertTriangle, Trophy } from "lucide-react";

/**
 * Ticker de alerta de déficit acumulado (épico Metas, 2b) + celebração.
 * Vive no HEADER da dashboard: ícone estático + texto em marquee (CSS puro
 * em globals.css, pausa no hover), fundo por severidade, texto preto.
 *
 * Estados (a troca acontece em tempo real via polling do Dashboard):
 *  - déficit > 0 e meta não batida → AMARELO/VERMELHO (severidade);
 *  - meta batida (produzido ≥ meta acumulada) → VERDE celebração por 10s,
 *    uma vez por dia (localStorage), depois fade-out 600ms → header limpo;
 *  - sem déficit e sem celebração pendente → null.
 */

export interface TickerDeficits {
  daily: number;
  weekly: number;
  monthly: number;
}

const CELEBRATION_MS = 10_000;

function todaySp(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function celebratedToday(): boolean {
  try {
    return localStorage.getItem(`meta-celebrated-${todaySp()}`) === "1";
  } catch {
    return false;
  }
}

function markCelebrated(): void {
  try {
    localStorage.setItem(`meta-celebrated-${todaySp()}`, "1");
  } catch {
    /* storage indisponível: celebra normalmente, só pode repetir no reload */
  }
}

export function DeficitTicker({
  deficits,
  dailyGoal,
  weeklyGoal,
  monthlyGoal,
  unit,
  completed = false,
}: {
  deficits: TickerDeficits | null | undefined;
  /** Metas ACUMULADAS (base + déficit). */
  dailyGoal: number | null;
  weeklyGoal: number | null;
  monthlyGoal: number | null;
  unit?: string | null;
  /** true quando produzido ≥ meta acumulada do dia (myMeta.completed). */
  completed?: boolean;
}) {
  const hasGoal = dailyGoal != null && dailyGoal > 0;
  const d = deficits?.daily ?? 0;
  const w = deficits?.weekly ?? 0;
  const m = deficits?.monthly ?? 0;
  const hasDeficit = hasGoal && (d > 0 || w > 0 || m > 0);

  // ── Celebração: dispara quando a meta é batida; roda 1x por dia ─────────
  const [celebrating, setCelebrating] = React.useState(false);
  React.useEffect(() => {
    if (!hasGoal || !completed) return;
    if (celebrating || celebratedToday()) return;
    setCelebrating(true);
    markCelebrated();
    const t = setTimeout(() => setCelebrating(false), CELEBRATION_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasGoal, completed]);

  // Meta batida silencia o ticker de déficit imediatamente.
  const showDeficit = hasDeficit && !completed;
  const active = celebrating || showDeficit;

  // Mantém montado durante o fade-out (600ms) ao desativar.
  const [visible, setVisible] = React.useState(active);
  React.useEffect(() => {
    if (active) {
      setVisible(true);
      return;
    }
    const t = setTimeout(() => setVisible(false), 600);
    return () => clearTimeout(t);
  }, [active]);

  if (!visible) return null;

  const u = unit || "conjuntos";
  const fmt = (n: number | null) => (n != null ? n.toLocaleString("pt-BR") : "—");

  // Severidade do déficit: dailyGoal é acumulada → base = acumulada − déficit;
  // déficit ≥ 1 meta base inteira = crítico (vermelho), senão atenção (amarelo).
  const baseDaily = (dailyGoal ?? 0) - d;
  const severity: "warning" | "critical" | "celebrate" = celebrating
    ? "celebrate"
    : baseDaily > 0 && d >= baseDaily
      ? "critical"
      : "warning";

  const multiple = [d, w, m].filter((x) => x > 0).length > 1;
  const single =
    d > 0
      ? { qty: d, label: "sua meta", goalLabel: "Sua meta de hoje é", goal: dailyGoal }
      : w > 0
        ? { qty: w, label: "a meta da semana", goalLabel: "Meta da semana:", goal: weeklyGoal }
        : { qty: m, label: "a meta do mês", goalLabel: "Meta do mês:", goal: monthlyGoal };
  const text = celebrating
    ? "Parabéns! Você bateu sua meta. Continue assim!"
    : multiple
      ? `Atenção: você possui déficit acumulado.   Meta do dia: ${fmt(dailyGoal)}   ·   Meta da semana: ${fmt(weeklyGoal)}   ·   Meta do mês: ${fmt(monthlyGoal)}`
      : `Você está ${fmt(single.qty)} ${u} atrás de ${single.label}. ${single.goalLabel} ${fmt(single.goal)}. Bora recuperar!`;

  const bg =
    severity === "celebrate" ? "bg-success" : severity === "critical" ? "bg-destructive" : "bg-warning";
  const Icon = severity === "celebrate" ? Trophy : AlertTriangle;

  return (
    <div
      role={severity === "celebrate" ? "status" : "alert"}
      data-severity={severity}
      className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-4 py-1.5 text-black transition-[background-color,opacity] duration-[600ms] ease-out ${bg} ${
        active ? "opacity-100" : "opacity-0"
      }`}
    >
      <Icon className="size-4 shrink-0 text-black" />
      <div className="ticker-marquee-container min-w-0 flex-1 overflow-hidden">
        <span className="ticker-marquee-text text-sm font-semibold text-black">{text}</span>
      </div>
    </div>
  );
}

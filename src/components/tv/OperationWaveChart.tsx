"use client";

import { useState } from "react";
import {
  ResponsiveContainer, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";
import type { HourlyPoint } from "@/lib/sector-kpis";

/**
 * Story 8.43 + refino Premium — Gráfico de ondas "Hoje vs Ontem".
 * Onda de hoje (esmeralda, sólida, por cima) sempre visível; onda de ontem
 * (cinza tracejada, atrás) aparece só ao ligar o toggle e cruza a de hoje.
 * Absorve a sobra vertical do grid (área "grafico", 1fr).
 */

const ACCENT = "#10b981"; // esmeralda — hoje
const PREV = "#a1a1aa"; // cinza — ontem
const WARN = "#f59e0b"; // âmbar — meta
const SUBTLE = "#71717a"; // eixos/captions

interface Props {
  label: string;
  data: HourlyPoint[];
  metaPorHora?: number;
}

export function OperationWaveChart({ label, data, metaPorHora }: Props) {
  const [showPreviousDay, setShowPreviousDay] = useState(false);
  const hasData = data.some((d) => (d.value ?? 0) > 0);

  return (
    <section className="flex h-full min-h-0 flex-col rounded-2xl border border-border bg-card p-6">
      {/* Header do card */}
      <header className="mb-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Desempenho da Operação
          </h2>
          <p className="mt-1 text-[14px] text-muted-foreground/70">{label} — Hoje</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={showPreviousDay}
          onClick={() => setShowPreviousDay((v) => !v)}
          className={`flex shrink-0 items-center gap-2.5 rounded-full border px-3.5 py-2 text-[12px] font-medium transition-colors duration-200 ${
            showPreviousDay
              ? "border-success/30 bg-success/10 text-success"
              : "border-border bg-foreground/[0.02] text-muted-foreground hover:text-foreground"
          }`}
        >
          <span
            className={`size-2 rounded-full transition-colors ${
              showPreviousDay ? "bg-success" : "bg-muted-foreground/60"
            }`}
          />
          Comparar com ontem
        </button>
      </header>

      {/* Plot */}
      <div className="relative min-h-0 flex-1">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="waveHoje" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="waveOntem" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={PREV} stopOpacity={0.16} />
                  <stop offset="100%" stopColor={PREV} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="label" tickLine={false} axisLine={false}
                tick={{ fill: SUBTLE, fontSize: 12 }} dy={8}
                interval="preserveStartEnd" minTickGap={24}
              />
              <YAxis
                tickLine={false} axisLine={false} width={40}
                tick={{ fill: SUBTLE, fontSize: 12 }} allowDecimals={false}
              />
              {metaPorHora ? (
                <ReferenceLine
                  y={metaPorHora} stroke={WARN}
                  strokeDasharray="4 4" strokeOpacity={0.5}
                  label={{ value: `Meta ${metaPorHora}/h`, fill: WARN, fontSize: 11, position: "insideTopRight" }}
                />
              ) : null}
              <Tooltip
                cursor={{ stroke: "rgba(255,255,255,0.12)", strokeWidth: 1 }}
                content={<WaveTooltip showPreviousDay={showPreviousDay} />}
              />
              {/* ONTEM atrás (renderiza primeiro) */}
              {showPreviousDay && (
                <Area
                  type="monotone" dataKey="value_prev" name="Ontem"
                  stroke={PREV} strokeWidth={2} strokeDasharray="5 5"
                  fill="url(#waveOntem)" dot={false}
                  activeDot={{ r: 4, fill: PREV, stroke: "var(--card)", strokeWidth: 2 }}
                  isAnimationActive animationDuration={650} animationEasing="ease-out"
                  connectNulls
                />
              )}
              {/* HOJE por cima, sólida grossa */}
              <Area
                type="monotone" dataKey="value" name="Hoje"
                stroke={ACCENT} strokeWidth={3}
                fill="url(#waveHoje)" dot={false}
                activeDot={{ r: 5, fill: ACCENT, stroke: "var(--card)", strokeWidth: 2 }}
                isAnimationActive animationDuration={800} animationEasing="ease-out"
                connectNulls
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChartState />
        )}
      </div>
    </section>
  );
}

interface TooltipPayloadItem {
  dataKey: string;
  value: number | null;
}
function WaveTooltip({
  active, payload, label, showPreviousDay,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  showPreviousDay: boolean;
}) {
  if (!active || !payload?.length) return null;
  const hoje = payload.find((p) => p.dataKey === "value")?.value;
  const ontem = payload.find((p) => p.dataKey === "value_prev")?.value;
  const delta = typeof hoje === "number" && typeof ontem === "number" ? hoje - ontem : null;
  return (
    <div className="rounded-xl border border-border bg-popover/95 px-3.5 py-2.5 shadow-xl backdrop-blur">
      <p className="mb-1.5 text-[12px] font-medium text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2 text-[14px]">
        <span className="size-2 rounded-full bg-success" />
        <span className="text-muted-foreground">Hoje</span>
        <span className="ml-auto font-semibold tabular-nums text-foreground">
          {hoje ?? "—"}
        </span>
      </div>
      {showPreviousDay && (
        <div className="mt-1 flex items-center gap-2 text-[14px]">
          <span className="size-2 rounded-full bg-muted-foreground/60" />
          <span className="text-muted-foreground">Ontem</span>
          <span className="ml-auto font-semibold tabular-nums text-muted-foreground">
            {ontem ?? "—"}
          </span>
        </div>
      )}
      {delta !== null && (
        <p className={`mt-1.5 text-[12px] font-medium tabular-nums ${delta >= 0 ? "text-success" : "text-destructive"}`}>
          {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} vs ontem
        </p>
      )}
    </div>
  );
}

function EmptyChartState() {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-background/30 p-6 text-center">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={SUBTLE} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 17l5-5 4 3 7-8" />
        <path d="M3 21h18" opacity={0.4} />
      </svg>
      <p className="text-[14px] font-medium text-muted-foreground">Sem produção registrada</p>
      <p className="text-[12px] text-muted-foreground/60">O gráfico aparece com as bipagens do dia.</p>
    </div>
  );
}

"use client";

import type { CSSProperties, ReactNode } from "react";
import { Activity, Boxes, Layers, ScanLine, TriangleAlert, Zap } from "lucide-react";
import { CountUp } from "@/components/ui/count-up";
import { RadialGauge } from "@/components/tv/instrument/RadialGauge";
import { GlassPanel, PanelLabel } from "@/components/tv/instrument/GlassPanel";
import { STATE_COLORS, paceFromPercent, nf } from "@/components/tv/instrument/state";
import { TVStageFlow } from "@/components/tv/TVStageFlow";
import { TVAlerts } from "@/components/tv/TVAlerts";

/**
 * Frente 4 — Visão GERAL, redesign "Instrumento".
 * Mesma linguagem do setor (gauge herói + glow de estado + vidro), com os dados
 * agregados do tenant: produção do dia, ritmo/pico, OPs/lotes ativos, defeitos e
 * bipagens. Rodapé mantém o fluxo por etapa e os alertas (já em cartão escuro).
 */

interface ProductionData {
  produced_today: number;
  daily_target: number;
  percent: number;
  current_rate: number;
  peak_rate: number;
  projected_end: number;
}
interface KpisData {
  active_ops: number;
  ops_target: number;
  active_lots: number;
  lots_target: number;
  defect_rate: number;
  defect_tolerance: number;
  scans_today: number;
  scans_yesterday: number;
}
interface StageData {
  stage_name: string;
  display_name: string;
  count: number;
  order_index: number;
  color: string;
}
interface AvgStageDuration {
  stage_id: string;
  stage_name: string;
  avg_hours: number;
  samples: number;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AlertItem = any;

const AREAS = `
  "hero hero kpis kpis"
  "hero hero kpis kpis"
  "flow flow flow  alerts"
`;
const gridStyle: CSSProperties = {
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gridTemplateRows: "minmax(0,0.8fr) minmax(0,0.8fr) minmax(0,1fr)",
  gridTemplateAreas: AREAS,
};

export function TVOverviewDefault({
  production,
  kpis,
  stages,
  avgStageDurations,
  alerts,
}: {
  production: ProductionData;
  kpis: KpisData;
  stages: StageData[];
  avgStageDurations?: AvgStageDuration[];
  alerts: AlertItem[];
}) {
  const percent = production.percent ?? 0;
  const state = paceFromPercent(percent);
  const color = STATE_COLORS[state];

  const distance = Math.max(0, Math.round(((production.daily_target || 0) - (production.produced_today || 0)) * 10) / 10);
  const done = production.daily_target > 0 && distance <= 0;
  const statusDetail = done ? "META BATIDA 🎉" : `FALTAM ${nf(distance)}`;

  const defectOver = kpis.defect_rate > kpis.defect_tolerance;
  const scansDelta = kpis.scans_today - kpis.scans_yesterday;

  return (
    <div className="relative h-full min-h-0 w-full">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(60% 55% at 30% 0%, ${color.glow} 0%, transparent 60%)`,
          opacity: 0.5,
          transition: "background 0.8s ease, opacity 0.8s ease",
        }}
      />

      <div className="relative grid h-full min-h-0 w-full gap-5" style={gridStyle}>
        {/* HERÓI */}
        <div className="flex min-h-0 min-w-0 flex-col items-center justify-center gap-4" style={{ gridArea: "hero" }}>
          <RadialGauge produced={production.produced_today ?? 0} target={production.daily_target ?? null} percent={percent} unit={null} state={state} />
          <div className="flex items-center gap-2.5 rounded-full border px-5 py-2" style={{ background: color.soft, borderColor: color.main, color: color.main }}>
            <span className="size-2.5 rounded-full tv-live-ping-dot" style={{ background: color.main }} />
            <span className="font-display uppercase tabular-nums" style={{ fontSize: "clamp(0.8rem,1.9vh,1.15rem)", fontWeight: 800, letterSpacing: "0.1em" }}>
              {color.label} — {statusDetail}
            </span>
          </div>
        </div>

        {/* KPIs — 2×3 vidro */}
        <div className="grid min-h-0 grid-cols-2 grid-rows-3 gap-4" style={{ gridArea: "kpis" }}>
          <Kpi label="Ritmo" icon={<Activity className="inline size-3.5 -translate-y-px" />} value={<CountUp value={production.current_rate ?? 0} />} unit="/h" />
          <Kpi label="Pico" icon={<Zap className="inline size-3.5 -translate-y-px" />} value={<CountUp value={production.peak_rate ?? 0} />} unit="/h" />
          <Kpi label="OPs Ativas" icon={<Boxes className="inline size-3.5 -translate-y-px" />} value={<CountUp value={kpis.active_ops ?? 0} />} sub={`meta ${nf(kpis.ops_target ?? 0)}`} />
          <Kpi label="Lotes Ativos" icon={<Layers className="inline size-3.5 -translate-y-px" />} value={<CountUp value={kpis.active_lots ?? 0} />} sub={`meta ${nf(kpis.lots_target ?? 0)}`} />
          <Kpi
            label="Defeitos"
            icon={<TriangleAlert className="inline size-3.5 -translate-y-px" />}
            value={`${nf(kpis.defect_rate ?? 0)}%`}
            sub={`tol. ${nf(kpis.defect_tolerance ?? 0)}%`}
            valueColor={defectOver ? "#ef4444" : undefined}
          />
          <Kpi
            label="Bipagens"
            icon={<ScanLine className="inline size-3.5 -translate-y-px" />}
            value={<CountUp value={kpis.scans_today ?? 0} />}
            sub={`${scansDelta >= 0 ? "▲" : "▼"} ${Math.abs(scansDelta)} vs ontem`}
            subColor={scansDelta >= 0 ? "#10b981" : "#ef4444"}
          />
        </div>

        {/* Rodapé — fluxo por etapa + alertas */}
        <div className="min-h-0" style={{ gridArea: "flow" }}>
          <TVStageFlow stages={stages} avgStageDurations={avgStageDurations} />
        </div>
        <div className="min-h-0" style={{ gridArea: "alerts" }}>
          <TVAlerts alerts={alerts} />
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  icon,
  value,
  unit,
  sub,
  valueColor,
  subColor,
}: {
  label: string;
  icon?: ReactNode;
  value: ReactNode;
  unit?: string;
  sub?: string;
  valueColor?: string;
  subColor?: string;
}) {
  return (
    <GlassPanel className="justify-between p-4">
      <PanelLabel>{icon}<span className={icon ? "ml-1.5" : ""}>{label}</span></PanelLabel>
      <div className="flex items-baseline gap-1.5">
        <span className="font-display tabular-nums leading-none" style={{ fontSize: "clamp(1.4rem,3.6vh,2.4rem)", fontWeight: 800, color: valueColor ?? "var(--color-foreground)" }}>
          {value}
        </span>
        {unit ? <span className="font-display uppercase text-muted-foreground" style={{ fontSize: "clamp(0.62rem,1.2vh,0.85rem)", fontWeight: 600, letterSpacing: "0.08em" }}>{unit}</span> : null}
      </div>
      {sub ? (
        <p className="font-display tabular-nums" style={{ fontSize: "clamp(0.58rem,1.1vh,0.75rem)", color: subColor ?? "var(--color-muted-foreground)" }}>{sub}</p>
      ) : null}
    </GlassPanel>
  );
}

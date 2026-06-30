"use client";

import { Clock, Truck, Target } from "lucide-react";
import type { KPIWidget } from "@/lib/dashboard-config";
import type { SectorKpis } from "@/lib/sector-kpis";
import { KpiCard, KpiLabel, KpiValue, KpiSupport } from "@/components/ui/kpi-card";
import { ProgressBar, toneFromPercent } from "@/components/ui/progress-bar";
import { CountUp } from "@/components/ui/count-up";
import { EmptyState } from "@/components/ui/data-states";
import { OperationWaveChart } from "@/components/tv/OperationWaveChart";
import { displayUnit } from "@/lib/utils";
import { Users } from "lucide-react";

/**
 * Story 8.40 — render de widgets da TV a partir da config do setor (8.38).
 * Mapeia widget.type/metric → componente, extraindo o dado do SectorKpis (8.35).
 * Métrica sem dado → EmptyState gracioso. Tipo desconhecido → ignora.
 */

interface WidgetProps {
  widget: KPIWidget;
  kpis: SectorKpis | null;
  index: number;
}

const nf = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

function fmtMin(min: number | null | undefined): string {
  if (min == null) return "—";
  if (min < 60) return `${Math.round(min)}min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

/* ── Meta do momento (produção vs meta diária) ── */
function ProgressWidget({ widget, kpis, index }: WidgetProps) {
  const unit = displayUnit(kpis?.unit);
  const hasDaily = kpis != null && kpis.daily_target != null && kpis.daily_target > 0;
  return (
    <KpiCard highlight index={index} className="h-full flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <KpiLabel>{widget.label}</KpiLabel>
        <span className={`font-mono tabular-nums text-[13px] ${kpis && kpis.percent >= 100 ? "text-success" : kpis && kpis.percent >= 80 ? "text-foreground" : "text-warning"}`}>
          {Math.round(kpis?.percent ?? 0)}%
        </span>
      </div>
      <div className="flex-1 flex flex-col justify-center">
        <KpiValue className="text-[clamp(3rem,7vw,5rem)]"><CountUp value={kpis?.produced ?? 0} /></KpiValue>
        <KpiSupport className="text-[16px] mt-1">/ {hasDaily ? nf(kpis!.daily_target as number) : "—"}{unit ? ` ${unit}` : ""}</KpiSupport>
      </div>
      <ProgressBar value={kpis?.produced ?? 0} max={hasDaily ? (kpis!.daily_target as number) : 100} height={8} glow thresholds={widget.thresholds} />
    </KpiCard>
  );
}

/* ── Contador genérico (produção) ── */
function CounterWidget({ widget, kpis, index }: WidgetProps) {
  if (!kpis) return <EmptyCard label={widget.label} index={index} />;
  const unit = displayUnit(kpis.unit);
  return (
    <KpiCard index={index} className="h-full flex flex-col justify-between">
      <KpiLabel>{widget.label}</KpiLabel>
      <KpiValue><CountUp value={kpis.produced ?? 0} /></KpiValue>
      <KpiSupport>{unit ? `${unit} · ` : ""}hoje</KpiSupport>
    </KpiCard>
  );
}

/* ── Distância da meta ── */
function StatusDistanceWidget({ widget, kpis, index }: WidgetProps) {
  const unit = displayUnit(kpis?.unit);
  const done = kpis != null && kpis.daily_target != null && kpis.distance_daily <= 0;
  return (
    <KpiCard index={index} className="h-full flex flex-col justify-between">
      <KpiLabel className="flex items-center gap-1.5"><Target className="size-3.5" /> {widget.label}</KpiLabel>
      {done ? (
        <KpiValue className="text-success">Batida 🎉</KpiValue>
      ) : (
        <div>
          <KpiValue><CountUp value={kpis?.distance_daily ?? 0} /></KpiValue>
          <KpiSupport>{unit ? `${unit} ` : ""}para a meta do dia</KpiSupport>
        </div>
      )}
    </KpiCard>
  );
}

/* ── Status da facção (semáforo) ── */
const FACTION_THEME = {
  on_time: { label: "No prazo", cls: "text-success", dot: "bg-success" },
  at_risk: { label: "Em risco", cls: "text-warning", dot: "bg-warning" },
  late: { label: "Atrasado", cls: "text-destructive", dot: "bg-destructive" },
} as const;

function FactionStatusWidget({ widget, kpis, index }: WidgetProps) {
  const fs = kpis?.faction_status;
  return (
    <KpiCard index={index} className="h-full flex flex-col justify-between">
      <KpiLabel className="flex items-center gap-1.5"><Truck className="size-3.5" /> {widget.label}</KpiLabel>
      {fs ? (
        <>
          <div className={`flex items-center gap-2 text-[28px] font-semibold ${FACTION_THEME[fs.status].cls}`}>
            <span className={`size-3 rounded-full ${FACTION_THEME[fs.status].dot} animate-pulse-dot`} />
            {FACTION_THEME[fs.status].label}
          </div>
          <KpiSupport className="truncate">
            {fs.faction_name} · {fs.hours_remaining < 0 ? `${fmtMin(Math.abs(fs.hours_remaining) * 60)} atrasado` : `faltam ${fmtMin(fs.hours_remaining * 60)}`}
          </KpiSupport>
        </>
      ) : (
        <KpiSupport className="text-muted-foreground/60">Sem remessa vigente</KpiSupport>
      )}
    </KpiCard>
  );
}

/* ── Tempo de processo ── */
function TimerWidget({ widget, kpis, index }: WidgetProps) {
  return (
    <KpiCard index={index} className="h-full flex flex-col justify-between">
      <KpiLabel className="flex items-center gap-1.5"><Clock className="size-3.5" /> {widget.label}</KpiLabel>
      <div className="font-display font-bold tabular-nums text-[clamp(1.8rem,3vw,2.5rem)] leading-none">
        {fmtMin(kpis?.elapsed_since_first_scan_min)}
      </div>
      <KpiSupport>Médio/lote: {fmtMin(kpis?.avg_per_lot_min)}</KpiSupport>
    </KpiCard>
  );
}

/* ── Comparativo de períodos (semana/mês) ── */
function ComparisonWidget({ widget, kpis, index }: WidgetProps) {
  const unit = displayUnit(kpis?.unit);
  const rows: Array<{ label: string; p: { target: number | null; progress: number; estimated: boolean } | undefined }> = [
    { label: "Semana", p: kpis?.weekly },
    { label: "Mês", p: kpis?.monthly },
  ];
  return (
    <KpiCard index={index} className="h-full flex flex-col gap-2">
      <KpiLabel>{widget.label}</KpiLabel>
      <div className="flex flex-col gap-2.5 mt-1">
        {rows.map((r) => {
          const pct = r.p?.target && r.p.target > 0 ? Math.min(100, Math.round((r.p.progress / r.p.target) * 100)) : 0;
          return (
            <div key={r.label}>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-muted-foreground">{r.label}{r.p?.estimated ? " (est.)" : ""}</span>
                <span className="tabular-nums">{nf(r.p?.progress ?? 0)} / {r.p?.target != null ? nf(r.p.target) : "—"}{unit ? ` ${unit}` : ""}</span>
              </div>
              <ProgressBar value={r.p?.progress ?? 0} max={r.p?.target ?? 100} tone={toneFromPercent(pct)} height={5} className="mt-1" />
            </div>
          );
        })}
      </div>
    </KpiCard>
  );
}

/* ── Produção por hora → gráfico de ondas Hoje×Ontem (preenche a célula) ── */
function ChartWidget({ widget, kpis }: WidgetProps) {
  const data = kpis?.hourly ?? [];
  const metaPorHora = kpis?.daily_target && kpis.daily_target > 0
    ? Math.round((kpis.daily_target / 8) * 10) / 10 // meta diária diluída em ~8h de turno
    : undefined;
  return <OperationWaveChart label={widget.label} data={data} metaPorHora={metaPorHora} />;
}

/* ── Ranking de colaboradores do setor (top 3) ── */
const MEDALS = ["🥇", "🥈", "🥉"];
function initialsOf(name: string): string {
  const w = name.trim().split(/\s+/);
  return (w.length >= 2 ? w[0][0] + w[1][0] : name.slice(0, 2)).toUpperCase();
}

function RankingWidget({ widget, kpis, index }: WidgetProps) {
  const rows = kpis?.top_collaborators ?? [];
  return (
    <KpiCard index={index} className="h-full flex flex-col">
      <KpiLabel className="flex items-center gap-1.5"><Users className="size-3.5" /> {widget.label}</KpiLabel>
      {rows.length > 0 ? (
        <div className="flex-1 flex flex-col justify-center gap-3 mt-2">
          {rows.map((c, i) => (
            <div key={c.name + i} className="flex items-center gap-3">
              <span className="text-[18px] w-6 text-center shrink-0">{MEDALS[i] ?? `${i + 1}º`}</span>
              <span className="grid place-items-center size-9 rounded-full bg-foreground/10 border border-foreground/10 font-display text-[13px] font-semibold shrink-0">
                {initialsOf(c.name)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[15px] font-medium truncate">{c.name}</span>
                  <span className="text-[14px] tabular-nums font-semibold shrink-0"><CountUp value={c.produced} /></span>
                </div>
                <ProgressBar value={c.pct} max={100} tone={i === 0 ? "neutral" : undefined} height={5} className="mt-1" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="Sem bipagens no setor hoje" description="O ranking aparece quando a equipe começa a produzir." className="py-6" />
      )}
    </KpiCard>
  );
}

/* ── Placeholder gracioso p/ métricas ainda sem fonte no sector_kpis ── */
function EmptyCard({ label, index, msg }: { label: string; index: number; msg?: string }) {
  return (
    <KpiCard index={index} className="h-full">
      <KpiLabel>{label}</KpiLabel>
      <EmptyState title={msg || "Sem dados"} description="Métrica em breve neste setor." className="py-4" />
    </KpiCard>
  );
}

/** Mapa metric → componente de dado; type orienta o fallback visual. */
export function WidgetRenderer({ widget, kpis, index }: WidgetProps) {
  switch (widget.metric) {
    case "meta_momento":
      return <ProgressWidget widget={widget} kpis={kpis} index={index} />;
    case "lotes_bipados":
      return <CounterWidget widget={widget} kpis={kpis} index={index} />;
    case "distancia_meta":
      return <StatusDistanceWidget widget={widget} kpis={kpis} index={index} />;
    case "faccao_status":
      return <FactionStatusWidget widget={widget} kpis={kpis} index={index} />;
    case "tempo_processo":
      return <TimerWidget widget={widget} kpis={kpis} index={index} />;
    case "metas_periodo":
      return <ComparisonWidget widget={widget} kpis={kpis} index={index} />;
    case "taxa_conclusao":
      return <ProgressWidget widget={widget} kpis={kpis} index={index} />;
    case "producao_hora":
      return <ChartWidget widget={widget} kpis={kpis} index={index} />;
    case "ranking_colaboradores":
      return <RankingWidget widget={widget} kpis={kpis} index={index} />;
    default:
      return null; // tipo/métrica desconhecida → ignora (forward-compat)
  }
}

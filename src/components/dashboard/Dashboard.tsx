import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cardEnter, cardEnterTransition } from "@/lib/motion";
import { Skeleton } from "@/components/ui/data-states";
import { CountUp } from "@/components/ui/count-up";
import { KpiCard, KpiLabel, KpiValue, KpiSupport } from "@/components/ui/kpi-card";
import { DeficitTicker } from "@/components/dashboard/DeficitTicker";
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight,
  Command, Layers, Menu, MoveRight, Users,
} from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Area, AreaChart, CartesianGrid,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import { AllowanceAlert } from "@/components/dashboard/AllowanceAlert";
import { TeamRankingCard } from "@/components/dashboard/TeamRankingCard";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import type { KpiResult, ChartDataPoint, ProductionOrder, DateRange, StaleLot, ActivityEvent, Targets, MyMeta } from "@/hooks/use-dashboard-data";
import type { UserProfile } from "@/hooks/use-user-profile";
import { humanizeEvent, relativeTimestamp, type ActivityEventRaw } from "@/lib/event-templates";
import { todayInTz } from "@/lib/tz";
import { chartPeriodToTenantHour } from "@/lib/dashboard-chart-time";

/* ------------------------------ types (re-exported from hook) ----------- */

export type { StaleLot, ActivityEvent } from "@/hooks/use-dashboard-data";

/* ------------------------------ small atoms ------------------------------ */

function Card({
  children,
  className = "",
  pad = true,
  index = 0,
}: {
  children: React.ReactNode;
  className?: string;
  pad?: boolean;
  index?: number;
}) {
  const reduce = useReducedMotion();
  if (reduce) {
    return (
      <div className={`relative rounded-2xl bg-card-gradient border border-border/60 border-gradient shadow-elegant overflow-hidden ${pad ? "p-5" : ""} ${className}`}>
        {children}
      </div>
    );
  }
  return (
    <motion.div
      variants={cardEnter}
      initial="hidden"
      animate="visible"
      transition={{ ...cardEnterTransition, delay: Math.min(index * 0.05, 0.4) }}
      className={`relative rounded-2xl bg-card-gradient border border-border/60 border-gradient shadow-elegant overflow-hidden ${pad ? "p-5" : ""} ${className}`}
    >
      {children}
    </motion.div>
  );
}

/* Story 8.42 — section header consistente (label + divider). */
function SectionHeader({ label }: { label: string }) {
  return (
    <div className="lg:col-span-12 flex items-center gap-3 mt-2">
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60 font-medium whitespace-nowrap">{label}</div>
      <div className="flex-1 h-px bg-border/40" />
    </div>
  );
}

function CardHeader({
  eyebrow,
  title,
  right,
}: {
  eyebrow?: string;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div>
        {eyebrow && (
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80 mb-1.5 font-medium">
            {eyebrow}
          </div>
        )}
        <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
      </div>
      {right}
    </div>
  );
}

function Trend({ value, suffix = "%" }: { value: number; suffix?: string }) {
  if (value === 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground font-mono">
        —
      </span>
    );
  const positive = value > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-mono font-medium ${
        positive ? "text-success" : "text-destructive"
      }`}
    >
      {positive ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {Math.abs(value).toFixed(1)}{suffix}
    </span>
  );
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border border-border/40 p-3 ${accent ? "bg-foreground text-background" : "bg-secondary/30"}`}>
      <div className={`text-[10px] uppercase tracking-wider mb-1 ${accent ? "text-background/70" : "text-muted-foreground"}`}>
        {label}
      </div>
      <div className="font-display text-[22px] font-semibold tabular-nums leading-none">{value}</div>
    </div>
  );
}

function SubMetric({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-mono text-sm tabular-nums mt-1 ${accent || ""}`}>{value}</div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-8 text-[13px] text-muted-foreground">
      {message}
    </div>
  );
}

/* --------------------------------- TopBar --------------------------------- */

function buildTickers(kpis: KpiResult | null) {
  if (!kpis) return [];
  const isWeighted = kpis.use_weighted_meta === true;
  return [
    {
      label: isWeighted ? "Pontos de Meta" : "Produzido hoje",
      value: (isWeighted ? kpis.produced_today : kpis.produced_today_sectors).toLocaleString("pt-BR", { maximumFractionDigits: 1 }),
      trend: 0,
    },
    { label: "Taxa defeito", value: `${kpis.defect_rate.toFixed(1)}%`, trend: 0 },
    { label: "Lotes ativos", value: kpis.total_lots.toString(), trend: 0 },
    { label: "OPs ativas", value: kpis.active_ops.toString(), trend: 0 },
    { label: "Total scans", value: kpis.total_scans.toLocaleString("pt-BR"), trend: 0 },
  ];
}

function TopBar({ now, kpis, userProfile, myMeta }: { now: Date; kpis: KpiResult | null; userProfile: UserProfile | null; myMeta: MyMeta | null }) {
  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const date = now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const tickerItems = buildTickers(kpis);

  return (
    <header className="sticky top-0 z-30 backdrop-blur-xl bg-background/70 border-b border-border/60">
      <div className="flex items-center gap-6 px-6 lg:px-10 h-16">
        <SidebarTrigger className="md:hidden -ml-2 size-9 rounded-lg bg-secondary/60 border border-border/60 text-muted-foreground hover:text-foreground">
          <Menu className="size-4" />
        </SidebarTrigger>

        {/* Épico Metas 2b — ticker de déficit em marquee, entre a esquerda e o relógio */}
        {myMeta ? (
          <DeficitTicker
            deficits={myMeta.deficits}
            dailyGoal={myMeta.target}
            weeklyGoal={myMeta.weekly?.target ?? null}
            monthlyGoal={myMeta.monthly?.target ?? null}
            unit={myMeta.unit}
            completed={myMeta.completed}
          />
        ) : (
          <div className="min-w-0 flex-1" />
        )}

        <div className="ml-auto flex items-center gap-3 shrink-0">
          <div className="hidden md:flex items-center gap-2 text-right leading-tight">
            <div className="text-right">
              <div className="font-mono text-sm tabular-nums" suppressHydrationWarning>
                {time}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground capitalize" suppressHydrationWarning>
                {date}
              </div>
            </div>
          </div>
          <div className="size-9 rounded-lg bg-foreground text-background grid place-items-center font-semibold text-sm">
            {userProfile?.initials || "?"}
          </div>
        </div>
      </div>

      {/* Ticker */}
      <div className="flex items-center gap-8 px-6 lg:px-10 h-10 border-t border-border/60 overflow-x-auto text-[12px]">
        {tickerItems.length > 0 ? (
          tickerItems.map((t) => (
            <div key={t.label} className="flex items-center gap-2 whitespace-nowrap shrink-0">
              <span className="text-muted-foreground uppercase tracking-wider text-[10px]">{t.label}</span>
              <span className="font-mono tabular-nums font-medium">{t.value}</span>
              {t.trend !== 0 && <Trend value={t.trend} />}
            </div>
          ))
        ) : (
          <span className="text-muted-foreground text-[11px]">Carregando indicadores...</span>
        )}
      </div>
    </header>
  );
}

/* ------------------------------ Targets ------------------------------ */

function parseTime(timeStr: string): { h: number; m: number } {
  const [h, m] = timeStr.split(":").map(Number);
  return { h: h || 0, m: m || 0 };
}

function getProjection(produced: number, shiftStart: string, shiftEnd: string, target: number): { projected: number; pct: number } {
  const now = new Date();
  const start = parseTime(shiftStart);
  const end = parseTime(shiftEnd);

  const shiftStartMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), start.h, start.m).getTime();
  const shiftEndMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), end.h, end.m).getTime();
  const nowMs = now.getTime();

  if (nowMs <= shiftStartMs || shiftEndMs <= shiftStartMs) {
    return { projected: produced, pct: target > 0 ? (produced / target) * 100 : 0 };
  }

  const hoursWorked = Math.max(0.1, (Math.min(nowMs, shiftEndMs) - shiftStartMs) / 3_600_000);
  const hoursRemaining = Math.max(0, (shiftEndMs - nowMs) / 3_600_000);
  const rate = produced / hoursWorked;
  const projected = produced + rate * hoursRemaining;
  const pct = target > 0 ? (projected / target) * 100 : 0;

  return { projected: Math.round(projected), pct };
}

/* --------------------- KPIs primários (região superior 8.43) --------------------- */

function PrimaryKpisRow({ kpis, targets }: { kpis: KpiResult | null; targets: Targets }) {
  if (!kpis) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 lg:col-span-12">
        {[0, 1, 2, 3, 4].map((i) => (
          <KpiCard key={i} index={i} className="min-h-[132px]"><Skeleton className="h-20" rounded="rounded-xl" /></KpiCard>
        ))}
      </div>
    );
  }
  const dailyTarget = targets.dailyPiecesTarget || 0;
  const pct = dailyTarget > 0 ? (kpis.produced_today / dailyTarget) * 100 : 0;
  const pctColor = pct >= 95 ? "text-success" : pct >= 80 ? "text-foreground" : "text-warning";

  const items = [
    { label: "Produzido hoje", value: kpis.produced_today_sectors, decimals: 1, support: "soma dos setores", highlight: true, valueClass: "" },
    { label: "Foi pro estoque", value: kpis.produced_today, decimals: kpis.use_weighted_meta ? 1 : 0, support: `/ ${dailyTarget.toLocaleString("pt-BR")}`, highlight: false, valueClass: "" },
    { label: "Lotes ativos", value: kpis.total_lots, decimals: 0, support: `meta ${targets.lotsTarget}`, highlight: false, valueClass: "" },
    { label: "% da meta", value: pct, decimals: 1, suffix: "%", support: "estoque / meta", highlight: false, valueClass: pctColor },
    { label: "OPs ativas", value: kpis.active_ops, decimals: 0, support: `meta ${targets.opsTarget}`, highlight: false, valueClass: "" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 lg:col-span-12">
      {items.map((it, i) => (
        <KpiCard key={it.label} highlight={it.highlight} interactive index={i} className="flex flex-col justify-between min-h-[132px]">
          <KpiLabel>{it.label}</KpiLabel>
          <KpiValue className={`text-[clamp(2rem,3vw,2.75rem)] ${it.valueClass}`}>
            <CountUp value={it.value} decimals={it.decimals} />{it.suffix ?? ""}
          </KpiValue>
          <KpiSupport>{it.support}</KpiSupport>
        </KpiCard>
      ))}
    </div>
  );
}

/* ------------------------------ Goal Cards ------------------------------- */

function GoalsRow({ kpis, targets, period }: { kpis: KpiResult | null; targets: Targets; period: Period }) {
  if (!kpis) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:col-span-12">
        {[1, 2, 3].map((i) => (
          <Card key={i} index={i}>
            <div className="space-y-3">
              <Skeleton className="h-3 w-20" rounded="rounded" />
              <Skeleton className="h-8 w-32" rounded="rounded" />
              <Skeleton className="h-1.5 w-full" rounded="rounded-full" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  const isWeighted = kpis.use_weighted_meta === true;
  const projection = getProjection(kpis.produced_today, targets.shiftStart, targets.shiftEnd, targets.dailyPiecesTarget);

  // Story 8.30: alvo de pontos conforme o período do toggle (valores independentes)
  const periodTarget =
    (period === "week" ? targets.weeklyPointsTarget
    : period === "month" ? targets.monthlyPointsTarget
    : targets.dailyPiecesTarget) ?? targets.dailyPiecesTarget ?? 0;
  const periodLabel = period === "week" ? "Semana" : period === "month" ? "Mês" : "Hoje";

  const goals = [
    {
      label: isWeighted ? `Pontos de Meta · ${periodLabel}` : periodLabel,
      produced: kpis.produced_today,
      target: periodTarget,
      unit: isWeighted ? "pontos" : "peças",
      showProjection: period === "today",
      tooltip: isWeighted && kpis.total_scans > 0
        ? `${kpis.total_scans} peças × coeficiente médio = ${kpis.produced_today.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} pontos`
        : undefined,
    },
    { label: "Lotes", produced: kpis.total_lots, target: targets.lotsTarget, unit: "lotes", showProjection: false, tooltip: undefined },
    { label: "OPs ativas", produced: kpis.active_ops, target: targets.opsTarget, unit: "ordens", showProjection: false, tooltip: undefined },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:col-span-12">
      {goals.map((g, i) => {
        const pct = g.target > 0 ? (g.produced / g.target) * 100 : 0;
        const barColor = g.showProjection
          ? projection.pct >= 80 ? "bg-success" : "bg-warning"
          : "bg-foreground";
        return (
          <Card key={g.label} className="group" index={i}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Meta · {g.label}</div>
                <div className="mt-2 flex items-baseline gap-2" title={g.tooltip || undefined}>
                  <span className="font-display text-[34px] font-semibold tabular-nums">
                    <CountUp value={g.produced ?? 0} decimals={isWeighted ? 1 : 0} />
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {g.target ? `/ ${g.target.toLocaleString("pt-BR")}` : "/ —"}
                  </span>
                </div>
              </div>
              <div className={`text-right font-mono text-sm tabular-nums ${pct >= 95 ? "text-success" : pct >= 80 ? "text-foreground" : "text-warning"}`}>
                {pct.toFixed(1)}%
              </div>
            </div>

            <div className="relative h-1.5 mt-4 rounded-full bg-secondary overflow-hidden">
              <motion.div
                className={`absolute inset-y-0 left-0 rounded-full ${barColor}`}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, pct)}%` }}
                transition={{ duration: 1.2, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>

            <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{g.unit}</span>
              {g.showProjection ? (
                <span className={`font-mono ${projection.pct >= 80 ? "text-success" : "text-warning"}`}>
                  Projeção: {projection.projected.toLocaleString("pt-BR")} ({projection.pct.toFixed(0)}%)
                </span>
              ) : (
                <span>faltam {Math.max(0, (g.target ?? 0) - (g.produced ?? 0)).toLocaleString("pt-BR")}</span>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/* ---------------------------- Hourly Production --------------------------- */

function buildShiftHours(shiftStart = "07:00", shiftEnd = "17:00") {
  const start = parseInt(shiftStart.split(":")[0], 10);
  const end = parseInt(shiftEnd.split(":")[0], 10);
  const hours: string[] = [];
  for (let h = start; h <= end; h++) {
    hours.push(`${h.toString().padStart(2, "0")}h`);
  }
  return hours;
}

function formatChartData(chart: ChartDataPoint[], shiftStart?: string, shiftEnd?: string) {
  const shiftHours = buildShiftHours(shiftStart, shiftEnd);
  const dataMap = new Map<string, { value: number; defects: number }>();

  for (const point of chart) {
      const hour = chartPeriodToTenantHour(point.period);
    dataMap.set(hour, { value: point.scans, defects: point.defects });
  }

  // Always return all shift hours, filling gaps with zero
  return shiftHours.map((hour) => {
    const d = dataMap.get(hour);
    return { hour, value: d?.value ?? 0, defects: d?.defects ?? 0 };
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const scans = payload[0]?.value ?? 0;
  const defects = payload[1]?.value ?? 0;
  return (
    <div className="rounded-lg border border-border/60 bg-card/95 backdrop-blur-sm px-3 py-2 shadow-lg">
      <p className="text-[11px] font-medium text-muted-foreground mb-1">{label}</p>
      <div className="flex items-center gap-2 text-[12px]">
        <span className="size-2 rounded-sm bg-foreground" />
        <span className="text-foreground font-semibold tabular-nums">{scans.toLocaleString("pt-BR")}</span>
        <span className="text-muted-foreground">bipagens</span>
      </div>
      {defects > 0 && (
        <div className="flex items-center gap-2 text-[12px] mt-0.5">
          <span className="size-2 rounded-sm bg-red-400" />
          <span className="text-red-400 font-semibold tabular-nums">{defects}</span>
          <span className="text-muted-foreground">defeitos</span>
        </div>
      )}
    </div>
  );
}

function HourlyChart({ chart, shiftStart, shiftEnd }: { chart: ChartDataPoint[]; shiftStart?: string; shiftEnd?: string }) {
  const chartData = formatChartData(chart, shiftStart, shiftEnd);
  const hasData = chartData.some((d) => d.value > 0 || d.defects > 0);

  const total = chartData.reduce((a, b) => a + b.value, 0);
  const totalDefects = chartData.reduce((a, b) => a + b.defects, 0);
  const maxEntry = hasData
    ? chartData.reduce((a, b) => (b.value > a.value ? b : a), chartData[0])
    : null;

  return (
    <Card className="lg:col-span-8">
      <CardHeader
        eyebrow="Produção por hora · turno atual"
        title="Bipagens registradas"
        right={
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-foreground" /> bipagens</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-red-400/60" /> defeitos</span>
          </div>
        }
      />
      <div className="h-[260px] -mx-2 relative">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="scanGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.98 0 0)" stopOpacity={0.20} />
                <stop offset="100%" stopColor="oklch(0.98 0 0)" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="defectGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.65 0.20 25)" stopOpacity={0.15} />
                <stop offset="100%" stopColor="oklch(0.65 0.20 25)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="oklch(0.18 0 0)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="hour" tick={{ fill: "oklch(0.50 0 0)", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "oklch(0.50 0 0)", fontSize: 11 }} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: "oklch(0.40 0 0)", strokeDasharray: "4 4" }} />
            <Area type="monotone" dataKey="value" name="Bipagens" stroke="oklch(0.90 0 0)" strokeWidth={2} fill="url(#scanGrad)" dot={hasData ? { r: 3, fill: "oklch(0.95 0 0)", strokeWidth: 0 } : false} activeDot={{ r: 5, fill: "oklch(0.98 0 0)", stroke: "oklch(0.98 0 0 / 0.3)", strokeWidth: 6 }} />
            <Area type="monotone" dataKey="defects" name="Defeitos" stroke="oklch(0.65 0.20 25)" strokeWidth={1.5} fill="url(#defectGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
        {!hasData && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-[13px] text-muted-foreground/50">Aguardando bipagens do turno</p>
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-border/40">
        <SubMetric label="Pico" value={maxEntry ? `${maxEntry.hour} · ${maxEntry.value}` : "—"} />
        <SubMetric label="Total bipagens" value={total.toLocaleString("pt-BR")} />
        <SubMetric label="Defeitos" value={totalDefects > 0 ? totalDefects.toLocaleString("pt-BR") : "0"} accent={totalDefects > 0 ? "text-red-400" : undefined} />
      </div>
    </Card>
  );
}

/* -------------------------------- Stages --------------------------------- */

function StagesCard({ kpis }: { kpis: KpiResult | null }) {
  if (!kpis || kpis.lots_by_stage.length === 0) {
    return (
      <Card className="lg:col-span-7">
        <CardHeader
          eyebrow="Fluxo da produção"
          title="Lotes por etapa"
          right={<Layers className="size-4 text-muted-foreground" />}
        />
        <EmptyState message="Sem dados de etapas disponíveis" />
      </Card>
    );
  }

  const stageData = kpis.lots_by_stage;
  const maxCount = Math.max(...stageData.map(s => s.count));

  return (
    <Card className="lg:col-span-7">
      <CardHeader
        eyebrow="Fluxo da produção"
        title="Lotes por etapa"
        right={<Layers className="size-4 text-muted-foreground" />}
      />
      <div className="space-y-2.5">
        {stageData.map((s, i) => {
          const w = (s.count / maxCount) * 100;
          return (
            <div key={s.stage_id} className="group">
              <div className="flex items-center justify-between text-[12px] mb-1.5">
                <span className="font-medium">{s.stage_name}</span>
                <div className="font-mono tabular-nums text-muted-foreground">
                  <span className="text-foreground">{s.count}</span> lotes
                </div>
              </div>
              <div className="relative h-7 rounded-md bg-secondary/40 overflow-hidden border border-border/40">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${w}%` }}
                  transition={{ duration: 1, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-foreground/80 to-foreground/20"
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ------------------------------ Defects Card ------------------------------ */

function DefectsCard({ kpis }: { kpis: KpiResult | null }) {
  if (!kpis) {
    return (
      <Card className="lg:col-span-5">
        <CardHeader eyebrow="Defeitos · retrabalho" title="Qualidade no chão de fábrica" />
        <EmptyState message="Dados de qualidade indisponíveis" />
      </Card>
    );
  }

  return (
    <Card className="lg:col-span-5">
      <CardHeader
        eyebrow="Defeitos · retrabalho"
        title="Qualidade no chão de fábrica"
      />
      <div className="grid grid-cols-2 gap-3 mb-5">
        <Metric label="Taxa defeito" value={`${kpis.defect_rate.toFixed(1)}%`} accent />
        <Metric
          label={kpis.use_weighted_meta ? "Pontos de Meta" : "Produzido hoje"}
          value={(kpis.use_weighted_meta ? kpis.produced_today : kpis.produced_today_sectors).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
        />
      </div>
      <p className="text-[12px] text-muted-foreground">
        Detalhes por tipo de defeito disponíveis no módulo <span className="font-medium text-foreground">Qualidade</span>.
      </p>
    </Card>
  );
}

/* --------------------------- Stage Duration Card -------------------------- */

function formatHours(h: number): string {
  if (h >= 1) return `${h.toFixed(1)}h`;
  return `${Math.round(h * 60)}min`;
}

function StageDurationCard({ kpis }: { kpis: KpiResult | null }) {
  const durations = kpis?.avg_stage_durations ?? [];

  if (durations.length === 0) {
    return (
      <Card className="lg:col-span-12">
        <CardHeader
          eyebrow="Tempo de processo"
          title="Tempo médio por etapa"
          right={<Layers className="size-4 text-muted-foreground" />}
        />
        <EmptyState message="Sem pares de início/fim bipados ainda — bipe o fim dos processos para medir o tempo." />
      </Card>
    );
  }

  const maxHours = Math.max(...durations.map((d) => d.avg_hours), 0.01);

  return (
    <Card className="lg:col-span-12">
      <CardHeader
        eyebrow="Tempo de processo"
        title="Tempo médio por etapa"
        right={<Layers className="size-4 text-muted-foreground" />}
      />
      <div className="space-y-2.5">
        {durations.map((d, i) => {
          const w = (d.avg_hours / maxHours) * 100;
          return (
            <div key={d.stage_id} className="group">
              <div className="flex items-center justify-between text-[12px] mb-1.5">
                <span className="font-medium">{d.stage_name}</span>
                <div className="font-mono tabular-nums text-muted-foreground">
                  <span className="text-foreground">{formatHours(d.avg_hours)}</span>
                  <span className="text-muted-foreground/60"> · {d.samples} {d.samples === 1 ? "amostra" : "amostras"}</span>
                </div>
              </div>
              <div className="relative h-7 rounded-md bg-secondary/40 overflow-hidden border border-border/40">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(w, 2)}%` }}
                  transition={{ duration: 1, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-foreground/80 to-foreground/20"
                />
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-4 pt-3 border-t border-border/40 text-[11px] text-muted-foreground">
        Calculado pelos pares de bipagem início → fim. Etapas sem fim bipado não entram na média.
      </p>
    </Card>
  );
}

/* ----------------------------- Production Orders --------------------------- */

function formatStatus(status: string) {
  const s = status.toLowerCase();
  if (s === "active" || s === "em dia") return { label: "ATIVO", style: "bg-success/10 text-success border-success/20" };
  if (s === "completed" || s === "done") return { label: "CONCLUÍDA", style: "bg-secondary text-muted-foreground border-border/40" };
  if (s === "cancelled") return { label: "CANCELADA", style: "bg-destructive/10 text-destructive border-destructive/20" };
  return { label: status.toUpperCase(), style: "bg-warning/10 text-warning border-warning/20" };
}

function OrdersCard({ orders }: { orders: ProductionOrder[] }) {
  if (orders.length === 0) {
    return (
      <Card className="lg:col-span-7" pad={false}>
        <div className="p-5 pb-3">
          <CardHeader eyebrow="Ordens de produção" title="OPs recentes" />
        </div>
        <EmptyState message="Nenhuma ordem de produção encontrada" />
      </Card>
    );
  }

  return (
    <Card className="lg:col-span-7" pad={false}>
      <div className="p-5 pb-3">
        <CardHeader
          eyebrow="Ordens de produção"
          title="OPs recentes"
          right={
            <button className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              ver todas <MoveRight className="size-3" />
            </button>
          }
        />
      </div>
      <div className="grid grid-cols-12 px-5 py-2 text-[10px] uppercase tracking-wider text-muted-foreground border-y border-border/40 bg-secondary/20">
        <div className="col-span-3">OP</div>
        <div className="col-span-4">Produto</div>
        <div className="col-span-2">Quantidade</div>
        <div className="col-span-2">Criada em</div>
        <div className="col-span-1 text-right">Status</div>
      </div>
      <div>
        {orders.map((o, i) => {
          const st = formatStatus(o.status);
          const createdAt = new Date(o.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
          return (
            <motion.div
              key={o.id}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 * i }}
              className="grid grid-cols-12 items-center px-5 py-3.5 text-[13px] border-b border-border/30 last:border-0 hover:bg-secondary/20 transition"
            >
              <div className="col-span-3">
                <div className="font-mono text-[11px] text-muted-foreground">{o.op_number}</div>
              </div>
              <div className="col-span-4 font-medium truncate">{o.product_name}</div>
              <div className="col-span-2 font-mono text-[12px] text-muted-foreground">
                {o.total_quantity.toLocaleString("pt-BR")}
              </div>
              <div className="col-span-2 font-mono text-[12px] text-muted-foreground">{createdAt}</div>
              <div className="col-span-1 text-right">
                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium whitespace-nowrap ${st.style}`}>
                  {st.label}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </Card>
  );
}

/* ----------------------------- Stalled Card ------------------------------ */

function StalledCard({ staleLots }: { staleLots: StaleLot[] }) {
  return (
    <Card className="lg:col-span-4">
      <CardHeader
        eyebrow="Atenção imediata"
        title="Lotes parados"
        right={
          staleLots.length > 0 ? (
            <span className="text-[11px] px-2 py-1 rounded-md bg-destructive/10 text-destructive border border-destructive/20 inline-flex items-center gap-1">
              <AlertTriangle className="size-3" /> {staleLots.length}
            </span>
          ) : undefined
        }
      />
      {staleLots.length === 0 ? (
        <EmptyState message="Nenhum lote parado" />
      ) : (
        <div className="space-y-2.5">
          {staleLots.map((b) => (
            <div key={b.barcode} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 border border-border/40 hover:border-foreground/40 transition">
              <div className="size-9 rounded-md bg-foreground text-background grid place-items-center font-mono text-[10px] font-bold shrink-0">
                {b.hours_stalled.toFixed(1)}h
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-mono text-[12px] font-medium">{b.barcode}</div>
                <div className="text-[11px] text-muted-foreground truncate">{b.stage_name}</div>
              </div>
              <div className="font-mono text-[10px] text-muted-foreground">{b.op_number}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ----------------------------- Ranking Card ------------------------------ */

function RankingCard({ kpis }: { kpis: KpiResult | null }) {
  if (!kpis || kpis.top_producers.length === 0) {
    return (
      <Card className="lg:col-span-5">
        <CardHeader
          eyebrow="Produtividade · hoje"
          title="Ranking de operadores"
          right={<Users className="size-4 text-muted-foreground" />}
        />
        <EmptyState message="Sem dados de produtividade" />
      </Card>
    );
  }

  return (
    <Card className="lg:col-span-5">
      <CardHeader
        eyebrow="Produtividade · hoje"
        title="Ranking de operadores"
        right={<Users className="size-4 text-muted-foreground" />}
      />
      <div className="space-y-2">
        {kpis.top_producers.slice(0, 5).map((r, i) => (
          <div key={r.user_id} className="flex items-center gap-3 py-2 border-b border-border/30 last:border-0">
            <div className={`size-7 rounded-md grid place-items-center font-display text-[13px] font-semibold tabular-nums ${
              i === 0 ? "bg-foreground text-background" : "bg-secondary text-foreground"
            }`}>
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium truncate">{r.full_name}</div>
              <div className="text-[10px] text-muted-foreground">{r.scan_count} bipagens</div>
            </div>
            <div className="text-right">
              <div className="font-mono tabular-nums text-sm">{r.scan_count}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* -------------------------------- Activity ------------------------------- */

function ActivityCard({ activityEvents }: { activityEvents: ActivityEvent[] }) {
  return (
    <Card className="lg:col-span-12">
      <CardHeader
        eyebrow="Live feed"
        title="Atividade recente"
        right={
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-success animate-pulse-dot" /> ao vivo
          </span>
        }
      />
      {activityEvents.length === 0 ? (
        <EmptyState message="Nenhuma atividade recente" />
      ) : (
        <div className="relative max-h-[260px] overflow-y-auto pr-1 -mr-2 grid grid-cols-1 md:grid-cols-2 gap-x-6">
          {activityEvents.map((a, i) => {
            const raw: ActivityEventRaw = {
              time: a.time,
              operator_name: a.operator_name,
              action: a.action,
              barcode: a.barcode,
              stage_name: a.stage_name,
            };
            const humanized = humanizeEvent(raw);
            const timeLabel = relativeTimestamp(a.time);

            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex items-start gap-3 py-2 border-b border-border/20 last:border-0"
              >
                <div className="font-mono text-[10px] text-muted-foreground w-10 pt-0.5 tabular-nums">{timeLabel}</div>
                <div className={`size-1.5 rounded-full mt-2 shrink-0 ${
                  a.action === "DEFECT_REPORT" || a.action === "DEFECT_REPORTED" ? "bg-destructive" : "bg-foreground"
                }`} />
                <div className="flex-1 min-w-0 text-[12px]">
                  <div className="leading-relaxed">{humanized}</div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* --------------------------------- helpers ------------------------------- */

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

/* --------------------------------- ROOT ---------------------------------- */

type Period = "today" | "week" | "month";

const PERIOD_LABELS: { key: Period; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "week", label: "Semana" },
  { key: "month", label: "Mês" },
];

function getDateRange(period: Period): DateRange {
  // Story 8.29: "hoje" e intervalos no fuso do tenant (não UTC).
  const to = todayInTz();
  // Base ao meio-dia local do dia "to" para o cálculo de dias não cruzar fuso.
  const base = new Date(`${to}T12:00:00`);
  const shift = (days: number) => {
    const d = new Date(base);
    d.setDate(d.getDate() - days);
    return new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  };
  switch (period) {
    case "today":
      return { from: to, to };
    case "week":
      return { from: shift(7), to };
    case "month":
      return { from: shift(30), to };
  }
}

export function Dashboard() {
  const [now, setNow] = useState(new Date());
  const [period, setPeriod] = useState<Period>("today");
  const dateRange = getDateRange(period);
  const { data, isLoading } = useDashboardData(dateRange);

  // Destructure consolidated data — 1 API call instead of 7
  const userProfile = data.profile;
  const staleLots = data.staleLots;
  const activityEvents = data.activity;
  const targets = data.targets;

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground relative">
      <div className="fixed inset-0 bg-grid opacity-30 pointer-events-none" />
      <div className="relative">
        <TopBar now={now} kpis={data.kpis} userProfile={userProfile} myMeta={data.myMeta} />

        <main className="px-6 lg:px-10 py-6 lg:py-8 max-w-[1600px] mx-auto">
          {/* Section title */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-end justify-between mb-6"
          >
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground mb-1">
                Visão geral
              </div>
              <h1 className="font-display text-[36px] lg:text-[44px] font-semibold tracking-tight leading-none">
                {getGreeting()}, {userProfile?.fullName?.split(" ")[0] || "Operador"}.
              </h1>
            </div>
            <div className="hidden md:flex items-center gap-2">
              {PERIOD_LABELS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  className={`px-3 py-1.5 rounded-md text-[12px] transition ${
                    period === p.key
                      ? "bg-foreground text-background font-medium"
                      : "text-muted-foreground hover:text-foreground border border-border/40"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </motion.div>

          {!data.isAuthenticated && !isLoading && (
            <div className="mb-6 p-4 rounded-xl border border-warning/30 bg-warning/5 text-[13px] text-warning">
              <AlertTriangle className="size-4 inline-block mr-2 -mt-0.5" />
              Sessão não autenticada — os dados exibidos podem estar incompletos. Faça login novamente.
            </div>
          )}

          <div className={`grid grid-cols-1 lg:grid-cols-12 gap-4 transition-opacity duration-300 ${isLoading && data.kpis ? "opacity-60" : "opacity-100"}`}>
            {/* Story 8.43: KPIs primários (região superior) */}
            <SectionHeader label="Hoje" />
            <PrimaryKpisRow kpis={data.kpis} targets={targets} />

            {/* Story 8.4: Allowance Alert */}
            <AllowanceAlert />

            {/* Épico Meu Plano: DailyPlanCard e MyMetaCard migraram para /meu-plano */}

            {/* Metas */}
            <GoalsRow kpis={data.kpis} targets={targets} period={period} />

            {/* Producao */}
            <SectionHeader label="Produção" />
            <HourlyChart chart={data.chart} shiftStart={targets.shiftStart} shiftEnd={targets.shiftEnd} />
            <StalledCard staleLots={staleLots} />

            {/* Pipeline */}
            <SectionHeader label="Pipeline" />
            <StagesCard kpis={data.kpis} />
            <DefectsCard kpis={data.kpis} />
            <StageDurationCard kpis={data.kpis} />

            {/* Operacoes */}
            <SectionHeader label="Operações" />
            <OrdersCard orders={data.orders} />
            <RankingCard kpis={data.kpis} />

            {/* Equipe */}
            <SectionHeader label="Equipe" />
            <div className="lg:col-span-5">
              <TeamRankingCard />
            </div>

            {/* Atividade */}
            <SectionHeader label="Atividade" />
            <ActivityCard activityEvents={activityEvents} />
          </div>

          <footer className="mt-10 pt-6 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground">
            <div className="inline-flex items-center gap-2">
              <Command className="size-3" /> v2.4 · sincronizando com PCP a cada 30s
            </div>
            <div>LISION — Rastreamento Têxtil</div>
          </footer>
        </main>
      </div>
    </div>
  );
}

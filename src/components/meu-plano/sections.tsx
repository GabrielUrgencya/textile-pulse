"use client";

import Link from "next/link";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AlertTriangle, CalendarDays, CheckCircle2, ClipboardList, Clock, Layers, TrendingUp } from "lucide-react";

/**
 * Módulo Meu Plano — seções visuais (redesign bento grid + glassmorphism).
 * Extraídas da page para permitir o preview dev-only com dados mockados
 * (loop visual da @ux) sem tocar na lógica de dados da rota real.
 */

/* ─────────────────────────── tipos ─────────────────────────── */

export interface PeriodProgress { target: number | null; progress: number; estimated: boolean }
export interface MetaData {
  stage_name: string;
  target: number | null;
  unit: string | null;
  progress: number;
  percent: number;
  weekly: PeriodProgress;
  monthly: PeriodProgress;
  elapsed_since_first_scan_min: number | null;
  avg_per_lot_min: number | null;
  completed: boolean;
  deficits: { daily: number; weekly: number; monthly: number };
}
export interface PlanItem { id: string; reference: string | null; color: string | null; size_label: string | null; quantity: number | null }
export interface Plan { id: string; plan_date: string; name: string | null; meta: number; items: PlanItem[] }
export interface HistoryPoint { date: string; produced: number; target: number | null }

/* ─────────────────────────── helpers ─────────────────────────── */

/** Glassmorphism padrão do módulo (blur perceptível + borda sutil). */
export const GLASS =
  "rounded-[20px] border border-[oklch(1_0_0_/_0.08)] bg-[oklch(1_0_0_/_0.04)] backdrop-blur-[16px] backdrop-saturate-[180%] shadow-elegant";

const pctColor = (pct: number, completed = false) =>
  completed || pct >= 95 ? "text-success" : pct >= 60 ? "text-warning" : "text-destructive";
const barColor = (pct: number, completed = false) =>
  completed || pct >= 95 ? "bg-success" : pct >= 60 ? "bg-warning" : "bg-destructive";
const glowVar = (pct: number, completed = false) =>
  completed || pct >= 95 ? "var(--success)" : pct >= 60 ? "var(--warning)" : "var(--destructive)";

const fmt = (n: number | null | undefined, d = 0) =>
  n != null ? n.toLocaleString("pt-BR", { maximumFractionDigits: d }) : "—";
const fmtMin = (min: number | null) => {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};
const dayLabel = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const weekdayLabel = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });

export function weekDates(today: string): string[] {
  const d = new Date(`${today}T12:00:00.000Z`);
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d);
    x.setUTCDate(x.getUTCDate() + i);
    return x.toISOString().slice(0, 10);
  });
}

/** Barra de progresso com glow dinâmico por threshold. */
function GlowBar({ pct, completed = false, height = "h-2" }: { pct: number; completed?: boolean; height?: string }) {
  return (
    <div className={`relative ${height} overflow-visible rounded-full bg-secondary/80`}>
      <div
        className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ${barColor(pct, completed)}`}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%`, boxShadow: `0 0 16px ${glowVar(pct, completed)}` }}
      />
    </div>
  );
}

/* ─────────────── Card 1: Minha Meta Diária (8 cols) ─────────────── */

/** Botão ghost discreto "Zerar meta" (admin only — renderiza só com onReset). */
function ResetGoalButton({ onReset }: { onReset?: () => void }) {
  if (!onReset) return null;
  return (
    <button
      onClick={onReset}
      className="rounded-md px-2 py-1 text-[11px] text-muted-foreground/70 transition hover:text-foreground hover:bg-secondary/60"
      title="Zerar acumulado e déficit deste período (admin)"
    >
      Zerar meta
    </button>
  );
}

export function MetaDailyCard({ meta, unit, onReset }: { meta: MetaData | null; unit: string; onReset?: () => void }) {
  if (!meta || meta.target == null) {
    return (
      <div className={`${GLASS} lg:col-span-8 flex flex-col items-center justify-center p-8 text-center`}>
        <ClipboardList className="mb-3 size-8 text-muted-foreground/50" />
        <p className="text-[15px] font-medium">Nenhuma meta configurada</p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Peça ao administrador para definir sua meta em Configurações → Metas.
        </p>
      </div>
    );
  }

  const pct = meta.percent;
  const deficit = meta.deficits?.daily ?? 0;
  const base = meta.target - deficit;

  return (
    <div className={`${GLASS} lg:col-span-8 flex flex-col justify-between p-6 ${meta.completed ? "border-success/40" : ""}`}>
      <div>
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Minha meta · {meta.stage_name}
          </div>
          <ResetGoalButton onReset={onReset} />
        </div>
        <div className="mt-3 flex flex-wrap items-baseline gap-2">
          <span className="font-display text-[56px] font-extrabold leading-none tabular-nums">
            {fmt(meta.progress, 1)}
          </span>
          <span className="text-[18px] text-muted-foreground tabular-nums">/ {fmt(meta.target)}</span>
          <span className="text-[14px] text-muted-foreground/70">{unit}</span>
        </div>
      </div>

      <div className="mt-5">
        <GlowBar pct={pct} completed={meta.completed} />
      </div>

      {meta.completed && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-success">
          <CheckCircle2 className="size-4" />
          <span className="text-[13px] font-medium">🎉 Meta concluída! Parabéns pelo dia.</span>
        </div>
      )}

      {deficit > 0 && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-warning/25 bg-warning/5 px-3 py-2 text-[12px]">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
          <span className="text-muted-foreground">
            <span className="text-foreground">Meta inclui déficit de {fmt(deficit)} {unit}.</span>{" "}
            Base: {fmt(base)} · Déficit: {fmt(deficit)} · Total: {fmt(meta.target)}
          </span>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Clock className="size-3.5" /> Decorrido hoje:{" "}
          <span className="text-foreground tabular-nums">{fmtMin(meta.elapsed_since_first_scan_min)}</span>
        </span>
        <span className="tabular-nums">Médio/lote: {fmtMin(meta.avg_per_lot_min)}</span>
      </div>
      <div className="mt-1.5 text-[12px] text-muted-foreground/70">
        Medido na sua etapa ({meta.stage_name}){unit ? `, em ${unit}` : ""}, ponderado pelo coeficiente da referência.
      </div>
    </div>
  );
}

/* ─────────────── Card 2: Desempenho % (4 cols) ─────────────── */

export function PercentCard({ meta }: { meta: MetaData | null }) {
  const pct = meta?.target != null ? meta.percent : null;
  const completed = meta?.completed ?? false;
  return (
    <div className={`${GLASS} lg:col-span-4 flex flex-col justify-between p-6`}>
      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">% da meta</div>
      <div
        className={`font-display text-[48px] font-extrabold leading-none tabular-nums ${
          pct == null ? "text-muted-foreground" : pctColor(pct, completed)
        }`}
      >
        {pct == null ? "—" : `${pct.toFixed(1)}%`}
      </div>
      <div className="text-[13px] text-muted-foreground">do dia</div>
    </div>
  );
}

/* ─────────────── Cards 3/4: Semana e Mês (6 cols cada) ─────────────── */

export function PeriodGoalCard({
  label,
  kpi,
  unit,
  onReset,
}: {
  label: string;
  kpi: PeriodProgress | null;
  unit: string;
  onReset?: () => void;
}) {
  const progress = kpi?.progress ?? 0;
  const target = kpi?.target ?? null;
  const pct = target && target > 0 ? Math.min(100, Math.round((progress / target) * 100)) : 0;
  return (
    <div className={`${GLASS} lg:col-span-6 flex flex-col justify-between p-6`}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          <TrendingUp className="size-3.5" /> {label}
        </span>
        <span className="flex items-center gap-1.5">
          {kpi?.estimated && (
            <span className="rounded border border-border/60 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground/60">
              est.
            </span>
          )}
          <ResetGoalButton onReset={onReset} />
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-display text-[36px] font-bold leading-none tabular-nums">{fmt(progress, 1)}</span>
        <span className="text-[15px] text-muted-foreground tabular-nums">/ {target != null ? fmt(target) : "—"}</span>
        <span className="text-[13px] text-muted-foreground/70">{unit}</span>
      </div>
      <div className="mt-4">
        <GlowBar pct={pct} height="h-1.5" />
      </div>
    </div>
  );
}

/* ─────────────── Card 5: Plano de Produção (12 cols) ─────────────── */

export function PlanCard({
  view,
  onViewChange,
  todayPlans,
  allPlans,
  producedByDay,
  producedToday,
  unit,
  isAdmin,
  today,
}: {
  view: "today" | "week" | "month";
  onViewChange: (v: "today" | "week" | "month") => void;
  todayPlans: Plan[];
  allPlans: Plan[];
  producedByDay: Record<string, number>;
  producedToday: number;
  unit: string;
  isAdmin: boolean;
  today: string;
}) {
  return (
    <div className={`${GLASS} lg:col-span-12 p-6`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Plano de produção</div>
          <div className="mt-1 text-[17px] font-semibold">
            {view === "today" ? "Hoje você precisa produzir" : view === "week" ? "Planos da semana" : "Consolidado do mês"}
          </div>
        </div>
        <div className="flex gap-1.5">
          {([["today", "Hoje"], ["week", "Semana"], ["month", "Mês"]] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => onViewChange(key)}
              className={`rounded-md px-3 py-1.5 text-[12px] transition ${
                view === key
                  ? "bg-foreground text-background font-medium"
                  : "text-muted-foreground hover:text-foreground border border-border/40"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {view === "today" && <PlanToday plans={todayPlans} produced={producedToday} unit={unit} isAdmin={isAdmin} />}
      {view === "week" && (
        <PlanWeek week={weekDates(today)} plans={allPlans} producedByDay={producedByDay} today={today} />
      )}
      {view === "month" && <PlanMonth plans={allPlans} producedByDay={producedByDay} today={today} />}
    </div>
  );
}

function PlanToday({ plans, produced, unit, isAdmin }: { plans: Plan[]; produced: number; unit: string; isAdmin: boolean }) {
  const totalMeta = plans.reduce((acc, p) => acc + (Number(p.meta) || 0), 0);
  const hasContent = plans.some((p) => p.items.length > 0) || totalMeta > 0;
  const pct = totalMeta > 0 ? Math.min(100, Math.round((produced / totalMeta) * 100)) : 0;

  if (!hasContent) {
    return (
      <div className="py-10 text-center">
        <CalendarDays className="mx-auto mb-3 size-8 text-muted-foreground/50" />
        <p className="text-[15px] font-medium">Nenhum plano de produção definido para hoje.</p>
        {isAdmin && (
          <Link
            href="/production/daily-plan"
            className="mt-3 inline-block rounded-lg bg-foreground px-4 py-2 text-[13px] font-medium text-background"
          >
            Criar plano
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-secondary/40 p-4">
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-muted-foreground">Progresso do plano de hoje</span>
          <span className="font-mono tabular-nums">
            {fmt(produced, 1)} / {fmt(totalMeta)} {unit} · <span className={pctColor(pct)}>{pct}%</span>
          </span>
        </div>
        <div className="mt-2">
          <GlowBar pct={pct} height="h-1.5" />
        </div>
      </div>

      {plans.map((plan) => (
        <div key={plan.id}>
          {plan.name && (
            <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">{plan.name}</div>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {plan.items.map((it) => (
              <div key={it.id} className="flex items-center gap-3 rounded-xl border border-border/40 bg-secondary/30 p-3">
                <Layers className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium">
                    {it.reference || "—"}
                    {it.color ? <span className="text-muted-foreground"> · {it.color}</span> : null}
                  </div>
                  {it.size_label && <div className="truncate text-[11px] text-muted-foreground">{it.size_label}</div>}
                </div>
                {it.quantity != null && (
                  <span className="font-mono text-[13px] tabular-nums">{fmt(it.quantity)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PlanWeek({ week, plans, producedByDay, today }: { week: string[]; plans: Plan[]; producedByDay: Record<string, number>; today: string }) {
  const byDate = new Map<string, Plan[]>();
  for (const p of plans) {
    const arr = byDate.get(p.plan_date) ?? [];
    arr.push(p);
    byDate.set(p.plan_date, arr);
  }
  return (
    <div className="space-y-2">
      {week.map((d) => {
        const dayPlans = byDate.get(d) ?? [];
        const metaDay = dayPlans.reduce((acc, p) => acc + (Number(p.meta) || 0), 0);
        const produced = producedByDay[d] || 0;
        const done = metaDay > 0 && produced >= metaDay;
        const isToday = d === today;
        const isPast = d < today;
        const status = dayPlans.length === 0
          ? { dot: "bg-muted-foreground/30", label: "Sem plano" }
          : done
            ? { dot: "bg-success", label: "Concluído" }
            : isToday
              ? { dot: "bg-blue-500", label: "Em andamento" }
              : isPast
                ? { dot: "bg-destructive", label: "Não concluído" }
                : { dot: "bg-muted-foreground/60", label: "Pendente" };
        return (
          <div key={d} className={`flex items-center gap-3 rounded-xl border p-3 ${isToday ? "border-foreground/30 bg-secondary/40" : "border-border/40 bg-secondary/20"}`}>
            <span className={`size-2.5 shrink-0 rounded-full ${status.dot}`} />
            <span className="w-28 shrink-0 text-[13px] capitalize">{weekdayLabel(d)}</span>
            <span className="flex-1 text-[12px] text-muted-foreground">{status.label}</span>
            {dayPlans.length > 0 && (
              <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
                {fmt(produced, 1)} / {fmt(metaDay)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PlanMonth({ plans, producedByDay, today }: { plans: Plan[]; producedByDay: Record<string, number>; today: string }) {
  const monthPrefix = today.slice(0, 7);
  const monthPlans = plans.filter((p) => p.plan_date.startsWith(monthPrefix));
  const planned = monthPlans.reduce((acc, p) => acc + (Number(p.meta) || 0), 0);
  const daysWithPlan = new Set(monthPlans.map((p) => p.plan_date)).size;
  const produced = Object.entries(producedByDay)
    .filter(([d]) => d.startsWith(monthPrefix))
    .reduce((acc, [, v]) => acc + v, 0);
  const pct = planned > 0 ? Math.min(100, Math.round((produced / planned) * 100)) : 0;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="rounded-xl bg-secondary/40 p-4">
        <p className="text-[12px] text-muted-foreground">Planejado no mês</p>
        <p className="mt-1 font-display text-[26px] font-semibold tabular-nums">{fmt(planned)}</p>
        <p className="text-[11px] text-muted-foreground">{daysWithPlan} dia(s) com plano</p>
      </div>
      <div className="rounded-xl bg-secondary/40 p-4">
        <p className="text-[12px] text-muted-foreground">Produzido no mês</p>
        <p className="mt-1 font-display text-[26px] font-semibold tabular-nums">{fmt(produced, 1)}</p>
      </div>
      <div className="rounded-xl bg-secondary/40 p-4">
        <p className="text-[12px] text-muted-foreground">Realização</p>
        <p className={`mt-1 font-display text-[26px] font-semibold tabular-nums ${planned > 0 ? pctColor(pct) : "text-muted-foreground"}`}>
          {planned > 0 ? `${pct}%` : "—"}
        </p>
        <div className="mt-2">
          <GlowBar pct={pct} height="h-1.5" />
        </div>
      </div>
    </div>
  );
}

/* ─────────────── Card 6: Histórico (12 cols) ─────────────── */

interface ChartPoint extends HistoryPoint { label: string; hit: boolean }

export function HistoryCard({
  history,
  unit,
  days,
  onDaysChange,
}: {
  history: HistoryPoint[];
  unit: string;
  days: 7 | 30;
  onDaysChange: (d: 7 | 30) => void;
}) {
  return (
    <div className={`${GLASS} lg:col-span-12 p-6`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Desempenho</div>
          <div className="mt-1 text-[17px] font-semibold">Histórico de produção</div>
        </div>
        <div className="flex gap-1.5">
          {([7, 30] as const).map((d) => (
            <button
              key={d}
              onClick={() => onDaysChange(d)}
              className={`rounded-md px-3 py-1.5 text-[12px] transition ${
                days === d
                  ? "bg-foreground text-background font-medium"
                  : "text-muted-foreground hover:text-foreground border border-border/40"
              }`}
            >
              {d} dias
            </button>
          ))}
        </div>
      </div>
      <HistoryChart history={history.slice(-days)} unit={unit} />
    </div>
  );
}

function HistoryChart({ history, unit }: { history: HistoryPoint[]; unit: string }) {
  const points: ChartPoint[] = history.map((h) => ({
    ...h,
    label: dayLabel(h.date),
    hit: h.target != null && h.target > 0 && h.produced >= h.target,
  }));
  const hasData = points.some((p) => p.produced > 0 || p.target != null);

  if (!hasData) {
    return (
      <div className="py-10 text-center text-[13px] text-muted-foreground">
        Sem dados de produção no período.
      </div>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="meuPlanoProd" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--foreground)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--foreground)" stopOpacity={0} />
            </linearGradient>
          </defs>
          {/* Grid horizontal sutil, sem linhas verticais */}
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as ChartPoint;
              const pct = p.target && p.target > 0 ? Math.round((p.produced / p.target) * 100) : null;
              return (
                <div className="rounded-lg border border-border bg-popover px-3 py-2 text-[12px] shadow-lg">
                  <p className="font-medium">{new Date(`${p.date}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" })}</p>
                  <p className="mt-1 tabular-nums">Produzido: <span className="font-medium">{fmt(p.produced, 1)} {unit}</span></p>
                  <p className="tabular-nums">Meta: {p.target != null ? `${fmt(p.target)} ${unit}` : "—"}</p>
                  {pct != null && (
                    <p className={`tabular-nums font-medium ${pct >= 100 ? "text-success" : "text-destructive"}`}>{pct}% atingido</p>
                  )}
                </div>
              );
            }}
          />
          <Area type="stepAfter" dataKey="target" stroke="var(--muted-foreground)" strokeDasharray="4 4" fill="none" strokeWidth={1} dot={false} />
          <Area
            type="monotone"
            dataKey="produced"
            stroke="var(--foreground)"
            strokeWidth={2}
            fill="url(#meuPlanoProd)"
            dot={(props: { cx?: number; cy?: number; payload?: ChartPoint; index?: number }) => {
              const { cx, cy, payload, index } = props;
              if (cx == null || cy == null || !payload) return <g key={index} />;
              if (payload.target == null || payload.target <= 0) return <g key={index} />;
              return (
                <circle
                  key={index}
                  cx={cx}
                  cy={cy}
                  r={3}
                  fill={payload.hit ? "var(--success)" : "var(--destructive)"}
                  stroke="var(--background)"
                  strokeWidth={1}
                />
              );
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─────────────── Skeleton (bento) ─────────────── */

export function MeuPlanoSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <div className={`${GLASS} lg:col-span-8 p-6`}>
        <div className="h-3 w-40 animate-pulse rounded bg-secondary" />
        <div className="mt-4 h-12 w-56 animate-pulse rounded bg-secondary" />
        <div className="mt-5 h-2 w-full animate-pulse rounded-full bg-secondary" />
      </div>
      <div className={`${GLASS} lg:col-span-4 p-6`}>
        <div className="h-3 w-24 animate-pulse rounded bg-secondary" />
        <div className="mt-4 h-12 w-32 animate-pulse rounded bg-secondary" />
      </div>
      <div className={`${GLASS} lg:col-span-6 p-6`}>
        <div className="h-3 w-24 animate-pulse rounded bg-secondary" />
        <div className="mt-4 h-9 w-40 animate-pulse rounded bg-secondary" />
        <div className="mt-4 h-1.5 w-full animate-pulse rounded-full bg-secondary" />
      </div>
      <div className={`${GLASS} lg:col-span-6 p-6`}>
        <div className="h-3 w-24 animate-pulse rounded bg-secondary" />
        <div className="mt-4 h-9 w-40 animate-pulse rounded bg-secondary" />
        <div className="mt-4 h-1.5 w-full animate-pulse rounded-full bg-secondary" />
      </div>
      <div className={`${GLASS} lg:col-span-12 p-6`}>
        <div className="h-3 w-36 animate-pulse rounded bg-secondary" />
        <div className="mt-4 h-28 w-full animate-pulse rounded-xl bg-secondary" />
      </div>
      <div className={`${GLASS} lg:col-span-12 p-6`}>
        <div className="h-3 w-36 animate-pulse rounded bg-secondary" />
        <div className="mt-4 h-56 w-full animate-pulse rounded-xl bg-secondary" />
      </div>
    </div>
  );
}

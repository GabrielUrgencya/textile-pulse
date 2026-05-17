import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Bell,
  CircleDot, Clock, Command, Factory, Gauge, Layers, MoveRight,
  Search, Settings, Sparkles, Target, TrendingUp, Users, Zap,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import {
  activity, allowance, defects, factions, factoryHealth, goals,
  hourlyProduction, productionOrders, projection, ranking,
  stages, stalledBatches, tickers,
} from "./data";

/* ------------------------------ small atoms ------------------------------ */

function Card({
  children,
  className = "",
  pad = true,
}: {
  children: React.ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return (
    <div
      className={`relative rounded-2xl bg-card-gradient border border-border/60 border-gradient shadow-elegant overflow-hidden ${pad ? "p-5" : ""} ${className}`}
    >
      {children}
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

/* --------------------------------- TopBar --------------------------------- */

function TopBar({ now }: { now: Date }) {
  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const date = now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <header className="sticky top-0 z-30 backdrop-blur-xl bg-background/70 border-b border-border/60">
      <div className="flex items-center gap-6 px-6 lg:px-10 h-16">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-lg bg-foreground text-background grid place-items-center">
            <Factory className="size-4.5" strokeWidth={2.2} />
          </div>
          <div className="leading-tight">
            <div className="font-display text-xl">Trama</div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground -mt-0.5">
              Production Intelligence
            </div>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2 ml-4">
          <NavItem active>Dashboard</NavItem>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden lg:flex items-center gap-2 px-3 h-9 rounded-lg bg-secondary/60 border border-border/60 text-sm text-muted-foreground w-72">
            <Search className="size-4" />
            <span className="flex-1">Pesquisar lotes, OPs, operadores…</span>
            <kbd className="text-[10px] font-mono bg-background/60 border border-border px-1.5 py-0.5 rounded">⌘K</kbd>
          </div>
          <div className="hidden md:flex items-center gap-2 text-right leading-tight">
            <div className="text-right">
              <div className="font-mono text-sm tabular-nums">{time}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground capitalize">{date}</div>
            </div>
          </div>
          <button className="size-9 rounded-lg bg-secondary/60 border border-border/60 grid place-items-center hover:bg-secondary transition">
            <Bell className="size-4" />
          </button>
          <button className="size-9 rounded-lg bg-secondary/60 border border-border/60 grid place-items-center hover:bg-secondary transition">
            <Settings className="size-4" />
          </button>
          <div className="size-9 rounded-lg bg-foreground text-background grid place-items-center font-semibold text-sm">
            JM
          </div>
        </div>
      </div>

      {/* Ticker */}
      <div className="flex items-center gap-8 px-6 lg:px-10 h-10 border-t border-border/60 overflow-x-auto text-[12px]">
        {tickers.map((t) => (
          <div key={t.label} className="flex items-center gap-2 whitespace-nowrap shrink-0">
            <span className="text-muted-foreground uppercase tracking-wider text-[10px]">{t.label}</span>
            <span className="font-mono tabular-nums font-medium">{t.value}</span>
            <Trend value={t.trend} />
          </div>
        ))}
      </div>
    </header>
  );
}

function NavItem({ children, active = false }: { children: React.ReactNode; active?: boolean }) {
  return (
    <div
      className={`px-3 py-1.5 rounded-md text-sm transition cursor-pointer ${
        active
          ? "bg-foreground text-background font-medium"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </div>
  );
}

/* --------------------------- Factory Health Hero -------------------------- */

function HealthHero() {
  const score = factoryHealth.score;
  const circ = 2 * Math.PI * 88;
  const offset = circ - (score / 100) * circ;

  return (
    <Card className="lg:col-span-7" pad={false}>
      <div className="relative p-6 lg:p-8">
        <div className="absolute inset-0 bg-grid opacity-40 pointer-events-none" />
        <div className="absolute inset-0 bg-radial pointer-events-none" />

        <div className="relative flex flex-col lg:flex-row items-start lg:items-center gap-8">
          {/* Gauge */}
          <div className="relative size-[220px] shrink-0">
            <svg viewBox="0 0 200 200" className="size-full -rotate-90">
              <circle cx="100" cy="100" r="88" stroke="oklch(0.18 0 0)" strokeWidth="10" fill="none" />
              <motion.circle
                cx="100" cy="100" r="88"
                stroke="oklch(0.98 0 0)" strokeWidth="10"
                strokeLinecap="round" fill="none"
                strokeDasharray={circ}
                initial={{ strokeDashoffset: circ }}
                animate={{ strokeDashoffset: offset }}
                transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
              />
            </svg>
            <div className="absolute inset-0 grid place-items-center">
              <div className="text-center">
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">Saúde Geral</div>
                <div className="font-display text-[56px] font-semibold leading-none tabular-nums">{score}</div>
                <div className="text-[11px] text-muted-foreground mt-1">de 100</div>
              </div>
            </div>
            <div className="absolute -top-2 -right-2 size-3 rounded-full bg-success shadow-[0_0_20px_oklch(0.75_0.16_145)] animate-pulse-dot" />
          </div>

          {/* Status */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <CircleDot className="size-3.5 text-success" />
              <span className="text-[11px] uppercase tracking-[0.22em] text-success font-medium">
                {factoryHealth.status}
              </span>
              <span className="text-muted-foreground text-[11px]">·</span>
              <Trend value={factoryHealth.trend} />
            </div>
            <h2 className="font-display text-[26px] font-semibold lg:text-4xl leading-[1.05] tracking-tight text-balance">
              A fábrica está operando<br />
              <span className="text-muted-foreground italic">acima do ritmo esperado.</span>
            </h2>
            <div className="flex items-center gap-2 mt-4 text-[11px] text-muted-foreground">
              <Clock className="size-3.5" />
              Última atualização {factoryHealth.lastUpdate}
              <span className="ml-2 inline-flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-foreground animate-pulse-dot" /> live
              </span>
            </div>

            {/* Alerts */}
            <div className="mt-5 space-y-1.5">
              {factoryHealth.alerts.map((a, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 + i * 0.08 }}
                  className="flex items-start gap-2.5 text-[12px] py-1.5 px-3 rounded-md bg-secondary/40 border border-border/40"
                >
                  <AlertTriangle className="size-3.5 mt-0.5 text-warning shrink-0" />
                  <span className="text-foreground/80">{a.text}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ----------------------------- Projection Card ---------------------------- */

function ProjectionCard() {
  return (
    <Card className="lg:col-span-5">
      <CardHeader
        eyebrow="Projeção do turno"
        title="Ritmo no ar"
        right={
          <div className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md bg-success/10 text-success border border-success/20">
            <Zap className="size-3" /> +{projection.delta} acima da meta
          </div>
        }
      />

      <div className="grid grid-cols-3 gap-4">
        <Metric label="Peças/hora" value={projection.rate.toString()} accent />
        <Metric label="Projetado" value={projection.projected.toLocaleString("pt-BR")} />
        <Metric label="Horas restantes" value={projection.shiftHoursLeft.toString().replace(".", ",") + "h"} />
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-2">
          <span>Meta do turno</span>
          <span className="font-mono">
            {projection.projected.toLocaleString("pt-BR")} / {projection.target.toLocaleString("pt-BR")}
          </span>
        </div>
        <div className="relative h-2.5 rounded-full bg-secondary overflow-hidden">
          <motion.div
            className="absolute inset-y-0 left-0 bg-foreground rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, (projection.projected / projection.target) * 100)}%` }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          />
          <div className="absolute inset-0 animate-shimmer rounded-full" />
        </div>
        <div className="flex items-center gap-1 mt-3 text-[11px] text-muted-foreground">
          <Sparkles className="size-3" /> projeção calculada nas últimas 2 horas
        </div>
      </div>
    </Card>
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

/* ------------------------------ Goal Cards ------------------------------- */

function GoalsRow() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:col-span-12">
      {goals.map((g, i) => {
        const pct = (g.produced / g.target) * 100;
        return (
          <Card key={g.label} className="group">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Meta · {g.label}</div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="font-display text-[34px] font-semibold tabular-nums">{g.produced.toLocaleString("pt-BR")}</span>
                  <span className="text-muted-foreground text-sm">/ {g.target.toLocaleString("pt-BR")}</span>
                </div>
              </div>
              <div className={`text-right font-mono text-sm tabular-nums ${pct >= 95 ? "text-success" : pct >= 80 ? "text-foreground" : "text-warning"}`}>
                {pct.toFixed(1)}%
              </div>
            </div>

            <div className="relative h-1.5 mt-4 rounded-full bg-secondary overflow-hidden">
              <motion.div
                className="absolute inset-y-0 left-0 bg-foreground rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, pct)}%` }}
                transition={{ duration: 1.2, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>

            <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{g.unit}</span>
              <span>faltam {(g.target - g.produced).toLocaleString("pt-BR")}</span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/* ---------------------------- Hourly Production --------------------------- */

function HourlyChart() {
  const max = Math.max(...hourlyProduction.map(h => h.value));
  return (
    <Card className="lg:col-span-8">
      <CardHeader
        eyebrow="Produção por hora · turno atual"
        title="Bipagens registradas"
        right={
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-foreground" /> bipado</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-px border-t border-dashed border-muted-foreground" /> ritmo ideal</span>
          </div>
        }
      />
      <div className="h-[260px] -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={hourlyProduction} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.98 0 0)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="oklch(0.98 0 0)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="oklch(0.18 0 0)" vertical={false} />
            <XAxis dataKey="hour" tick={{ fill: "oklch(0.62 0 0)", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "oklch(0.62 0 0)", fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
            <Tooltip
              cursor={{ fill: "oklch(0.18 0 0)", opacity: 0.3 }}
              contentStyle={{
                background: "oklch(0.10 0 0)",
                border: "1px solid oklch(0.22 0 0)",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "oklch(0.62 0 0)" }}
            />
            <Area type="monotone" dataKey="value" stroke="oklch(0.98 0 0)" strokeWidth={2} fill="url(#barGrad)" />
            <Area type="monotone" dataKey="ideal" stroke="oklch(0.55 0 0)" strokeWidth={1.5} strokeDasharray="4 4" fill="transparent" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-border/40">
        <SubMetric label="Maior produção" value={`10h · ${max}`} />
        <SubMetric label="Menor produção" value="12h · 92" />
        <SubMetric label="Total no turno" value={hourlyProduction.reduce((a, b) => a + b.value, 0).toLocaleString("pt-BR")} />
      </div>
    </Card>
  );
}

function SubMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono text-sm tabular-nums mt-1">{value}</div>
    </div>
  );
}

/* ------------------------------ Allowance --------------------------------- */

function AllowanceCard() {
  const pieData = [
    { name: "Boas", value: 100 - allowance.ratePct },
    { name: "Perda", value: allowance.ratePct },
  ];
  return (
    <Card className="lg:col-span-4">
      <CardHeader
        eyebrow="Allowance · mês"
        title="Taxa de perda"
        right={
          <span className="text-[11px] px-2 py-1 rounded-md bg-success/10 text-success border border-success/20">
            dentro da meta
          </span>
        }
      />
      <div className="relative h-[180px] grid place-items-center">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData} dataKey="value" innerRadius={60} outerRadius={80}
              startAngle={90} endAngle={-270} strokeWidth={0}
            >
              <Cell fill="oklch(0.98 0 0)" />
              <Cell fill="oklch(0.20 0 0)" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <div className="text-center">
            <div className="font-display text-[26px] font-semibold tabular-nums">{allowance.ratePct}%</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">de {allowance.targetPct}%</div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mt-2 pt-4 border-t border-border/40">
        <SubMetric label="Perdas hoje" value={`${allowance.lostToday} peças`} />
        <SubMetric label="Perdas mês" value={`${allowance.lostMonth} peças`} />
      </div>
    </Card>
  );
}

/* -------------------------------- Stages --------------------------------- */

function StagesCard() {
  return (
    <Card className="lg:col-span-7">
      <CardHeader
        eyebrow="Fluxo da produção"
        title="Peças por etapa"
        right={<Layers className="size-4 text-muted-foreground" />}
      />
      <div className="space-y-2.5">
        {stages.map((s, i) => {
          const total = Math.max(...stages.map(x => x.pieces));
          const w = (s.pieces / total) * 100;
          return (
            <div key={s.name} className="group">
              <div className="flex items-center justify-between text-[12px] mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{s.name}</span>
                  {s.over && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/15 text-destructive border border-destructive/30">
                      acima do tempo
                    </span>
                  )}
                </div>
                <div className="font-mono tabular-nums text-muted-foreground">
                  <span className="text-foreground">{s.pieces}</span> peças · {s.lots} lotes · {s.avgTime}
                  <span className="text-muted-foreground/60"> / esperado {s.expected}</span>
                </div>
              </div>
              <div className="relative h-7 rounded-md bg-secondary/40 overflow-hidden border border-border/40">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${w}%` }}
                  transition={{ duration: 1, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }}
                  className={`absolute inset-y-0 left-0 ${s.over ? "bg-gradient-to-r from-destructive/40 to-destructive/10" : "bg-gradient-to-r from-foreground/80 to-foreground/20"}`}
                />
                <div className="absolute inset-y-0 left-0 w-full flex items-center px-2 text-[10px] font-mono text-foreground/70">
                  {Array.from({ length: 30 }).map((_, k) => (
                    <span key={k} className="w-1 h-0.5 mr-1 bg-foreground/10" />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ------------------------------ Defects Card ------------------------------ */

function DefectsCard() {
  const max = Math.max(...defects.byType.map(d => d.value));
  return (
    <Card className="lg:col-span-5">
      <CardHeader
        eyebrow="Defeitos · retrabalho"
        title="Qualidade no chão de fábrica"
      />
      <div className="grid grid-cols-3 gap-3 mb-5">
        <Metric label="Fila retrabalho" value={defects.reworkQueue.toString()} accent />
        <Metric label="Hoje" value={defects.today.toString()} />
        <Metric label="No mês" value={defects.month.toString()} />
      </div>
      <div className="space-y-2.5">
        {defects.byType.map((d, i) => (
          <div key={d.type}>
            <div className="flex justify-between text-[12px] mb-1">
              <span>{d.type}</span>
              <span className="font-mono tabular-nums text-muted-foreground">{d.value}</span>
            </div>
            <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(d.value / max) * 100}%` }}
                transition={{ duration: 1, delay: i * 0.08 }}
                className="h-full bg-foreground rounded-full"
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ----------------------------- Production Orders --------------------------- */

function OrdersCard() {
  return (
    <Card className="lg:col-span-8" pad={false}>
      <div className="p-5 pb-3">
        <CardHeader
          eyebrow="Ordens de produção"
          title="OPs em andamento"
          right={
            <button className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              ver todas <MoveRight className="size-3" />
            </button>
          }
        />
      </div>
      <div className="grid grid-cols-12 px-5 py-2 text-[10px] uppercase tracking-wider text-muted-foreground border-y border-border/40 bg-secondary/20">
        <div className="col-span-3">OP</div>
        <div className="col-span-3">Produto</div>
        <div className="col-span-3">Progresso</div>
        <div className="col-span-2">Prazo</div>
        <div className="col-span-1 text-right">Status</div>
      </div>
      <div>
        {productionOrders.map((o, i) => {
          const pct = (o.done / o.total) * 100;
          return (
            <motion.div
              key={o.id}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 * i }}
              className="grid grid-cols-12 items-center px-5 py-3.5 text-[13px] border-b border-border/30 last:border-0 hover:bg-secondary/20 transition"
            >
              <div className="col-span-3">
                <div className="font-mono text-[11px] text-muted-foreground">{o.id}</div>
              </div>
              <div className="col-span-3 font-medium truncate">{o.name}</div>
              <div className="col-span-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full bg-foreground rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="font-mono text-[11px] text-muted-foreground tabular-nums w-10 text-right">{pct.toFixed(0)}%</span>
                </div>
                <div className="text-[10px] text-muted-foreground mt-1 font-mono">
                  {o.done.toLocaleString("pt-BR")} / {o.total.toLocaleString("pt-BR")}
                </div>
              </div>
              <div className="col-span-2 font-mono text-[12px] text-muted-foreground">{o.due}</div>
              <div className="col-span-1 text-right">
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded border font-medium whitespace-nowrap ${
                    o.status === "EM DIA" ? "bg-success/10 text-success border-success/20" :
                    o.status === "ATENÇÃO" ? "bg-warning/10 text-warning border-warning/20" :
                    "bg-destructive/10 text-destructive border-destructive/20"
                  }`}
                >
                  {o.status}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </Card>
  );
}

/* ---------------------------- Stalled / Ranking --------------------------- */

function StalledCard() {
  return (
    <Card className="lg:col-span-4">
      <CardHeader
        eyebrow="Atenção imediata"
        title="Lotes parados"
        right={
          <span className="text-[11px] px-2 py-1 rounded-md bg-destructive/10 text-destructive border border-destructive/20 inline-flex items-center gap-1">
            <AlertTriangle className="size-3" /> {stalledBatches.length}
          </span>
        }
      />
      <div className="space-y-2.5">
        {stalledBatches.map((b) => (
          <div key={b.code} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 border border-border/40 hover:border-foreground/40 transition">
            <div className="size-9 rounded-md bg-foreground text-background grid place-items-center font-mono text-[10px] font-bold shrink-0">
              {b.hours.toFixed(1)}h
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-mono text-[12px] font-medium">{b.code}</div>
              <div className="text-[11px] text-muted-foreground truncate">{b.stage} · {b.operator}</div>
            </div>
            <div className="font-mono text-[10px] text-muted-foreground">{b.op}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function RankingCard() {
  return (
    <Card className="lg:col-span-5">
      <CardHeader
        eyebrow="Produtividade · hoje"
        title="Ranking de operadores"
        right={<Users className="size-4 text-muted-foreground" />}
      />
      <div className="space-y-2">
        {ranking.map((r, i) => {
          const pct = (r.score / r.target) * 100;
          return (
            <div key={r.name} className="flex items-center gap-3 py-2 border-b border-border/30 last:border-0">
              <div className={`size-7 rounded-md grid place-items-center font-display text-[13px] font-semibold tabular-nums ${
                i === 0 ? "bg-foreground text-background" : "bg-secondary text-foreground"
              }`}>
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium truncate">{r.name}</div>
                <div className="text-[10px] text-muted-foreground">{r.sector}</div>
              </div>
              <div className="text-right">
                <div className="font-mono tabular-nums text-sm">{r.score}</div>
                <div className="text-[10px] text-muted-foreground font-mono">{pct.toFixed(0)}% meta</div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ------------------------------ Factions --------------------------------- */

function FactionsCard() {
  return (
    <Card className="lg:col-span-7">
      <CardHeader
        eyebrow="Facções externas"
        title="Lotes fora da fábrica"
      />
      <div className="grid grid-cols-12 px-1 pb-2 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
        <div className="col-span-4">Facção</div>
        <div className="col-span-2 text-right">Peças</div>
        <div className="col-span-2 text-right">Lotes</div>
        <div className="col-span-2 text-right">Defeito</div>
        <div className="col-span-2 text-right">Prazo</div>
      </div>
      {factions.map((f) => (
        <div key={f.name} className="grid grid-cols-12 items-center py-3 text-[13px] border-b border-border/30 last:border-0">
          <div className="col-span-4 flex items-center gap-2.5">
            <div className="size-7 rounded-md bg-secondary border border-border/60 grid place-items-center text-[10px] font-mono font-bold">
              {f.name.split(" ").map(w => w[0]).join("").slice(0, 2)}
            </div>
            <span className="font-medium truncate">{f.name}</span>
          </div>
          <div className="col-span-2 text-right font-mono tabular-nums">{f.pieces.toLocaleString("pt-BR")}</div>
          <div className="col-span-2 text-right font-mono tabular-nums text-muted-foreground">{f.lots}</div>
          <div className="col-span-2 text-right font-mono tabular-nums">
            <span className={f.defectRate > 2.5 ? "text-destructive" : ""}>{f.defectRate}%</span>
          </div>
          <div className="col-span-2 text-right">
            {f.daysLeft < 0 ? (
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/20 font-mono">
                {Math.abs(f.daysLeft)}d atraso
              </span>
            ) : (
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-secondary border border-border/40 font-mono text-muted-foreground">
                em {f.daysLeft}d
              </span>
            )}
          </div>
        </div>
      ))}
    </Card>
  );
}

/* -------------------------------- Activity ------------------------------- */

function ActivityCard() {
  return (
    <Card className="lg:col-span-5">
      <CardHeader
        eyebrow="Live feed"
        title="Atividade recente"
        right={
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-success animate-pulse-dot" /> ao vivo
          </span>
        }
      />
      <div className="relative max-h-[320px] overflow-y-auto pr-1 -mr-2 space-y-1">
        {activity.map((a, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            className="flex items-start gap-3 py-2 border-b border-border/20 last:border-0"
          >
            <div className="font-mono text-[10px] text-muted-foreground w-10 pt-0.5 tabular-nums">{a.time}</div>
            <div className={`size-1.5 rounded-full mt-2 shrink-0 ${
              a.action === "Defeito" ? "bg-destructive" :
              a.action === "OP concluída" ? "bg-success" :
              "bg-foreground"
            }`} />
            <div className="flex-1 min-w-0 text-[12px]">
              <div className="truncate">
                <span className="font-medium">{a.op}</span>
                <span className="text-muted-foreground"> · {a.action}</span>
              </div>
              <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                {a.batch} · {a.stage}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </Card>
  );
}

/* --------------------------------- ROOT ---------------------------------- */

export function Dashboard() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground relative">
      <div className="fixed inset-0 bg-grid opacity-30 pointer-events-none" />
      <div className="relative">
        <TopBar now={now} />

        <main className="px-6 lg:px-10 py-6 lg:py-8 max-w-[1600px] mx-auto">
          {/* Section title */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-end justify-between mb-6"
          >
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground mb-1">
                Visão geral · Turno A
              </div>
              <h1 className="font-display text-[34px] font-semibold lg:text-5xl tracking-tight leading-none">
                Bom dia, Jonatas.
              </h1>
            </div>
            <div className="hidden md:flex items-center gap-2">
              {["Hoje", "Semana", "Mês", "Trimestre"].map((p, i) => (
                <button
                  key={p}
                  className={`px-3 py-1.5 rounded-md text-[12px] transition ${
                    i === 0 ? "bg-foreground text-background font-medium" : "text-muted-foreground hover:text-foreground border border-border/40"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <HealthHero />
            <ProjectionCard />

            <GoalsRow />

            <HourlyChart />
            <AllowanceCard />

            <StagesCard />
            <DefectsCard />

            <OrdersCard />
            <StalledCard />

            <RankingCard />
            <FactionsCard />

            <ActivityCard />
            <HealthSummary />
          </div>

          <footer className="mt-10 pt-6 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground">
            <div className="inline-flex items-center gap-2">
              <Command className="size-3" /> v2.4 · sincronizando com PCP a cada 30s
            </div>
            <div>Trama Production Intelligence</div>
          </footer>
        </main>
      </div>
    </div>
  );
}

/* ----------------------------- Health Summary ----------------------------- */

function HealthSummary() {
  const items = [
    { icon: Gauge,      label: "OEE",        value: "87%" },
    { icon: Target,     label: "Meta dia",   value: "87.7%" },
    { icon: Activity,   label: "Ritmo",      value: "218/h" },
    { icon: TrendingUp, label: "vs ontem",   value: "+6.2%" },
  ];
  return (
    <Card className="lg:col-span-7">
      <CardHeader eyebrow="Resumo" title="KPIs do turno" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {items.map(({ icon: Icon, label, value }) => (
          <div key={label} className="rounded-xl border border-border/40 bg-secondary/30 p-4">
            <Icon className="size-4 text-muted-foreground mb-3" />
            <div className="font-display text-[22px] font-semibold tabular-nums">{value}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{label}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 p-4 rounded-xl bg-secondary/30 border border-border/40">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-2">
          <Sparkles className="size-3" /> Insight automático
        </div>
        <p className="text-[13px] leading-relaxed text-foreground/90">
          Costura B está concentrando <span className="font-semibold">42% do gargalo</span> do turno.
          Realocar 2 operadores de Acabamento pode recuperar até <span className="font-semibold">180 peças</span> até o fim do dia.
        </p>
      </div>
    </Card>
  );
}

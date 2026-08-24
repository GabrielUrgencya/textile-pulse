"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { salesAdminConfigurationRequest } from "@/components/sales/admin/SalesAdminConfiguration";
import { CountUp } from "@/components/ui/count-up";
import { RadialGauge } from "@/components/tv/instrument/RadialGauge";
import { MiniRing } from "@/components/tv/instrument/MiniRing";
import { paceFromPercent } from "@/components/tv/instrument/state";
import type { SalesAdminConfiguration } from "@/lib/sales-admin-configuration";
import type { SalesDashboard, SalesList } from "@/lib/sales-admin-sales";

const money = (v: unknown) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(Number(v) || 0);
const moneyFull = (v: unknown) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);
const moneyShort = (v: unknown) => { const n = Number(v) || 0; return Math.abs(n) >= 1000 ? `R$ ${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k` : money(n); };
const int = (v: unknown) => new Intl.NumberFormat("pt-BR").format(Number(v) || 0);
const num = (v: unknown) => Number(v) || 0;
const REFRESH_MS = 15_000;

type DayPoint = { label: string; day: number; diario: number; acumulado: number };

async function fetchAllSales(periodId: string): Promise<SalesList["items"]> {
  const items: SalesList["items"] = [];
  let page = 1;
  for (;;) {
    const res = await salesAdminConfigurationRequest<SalesList>(`/api/vendas/admin/sales?page=${page}&period=${periodId}&status=CLOSED&sort=sold_at&direction=asc`);
    items.push(...res.items);
    if (items.length >= Number(res.total) || res.items.length === 0 || page > 40) break;
    page += 1;
  }
  return items;
}

export function SalesLiveTv() {
  const [config, setConfig] = useState<SalesAdminConfiguration | null>(null);
  const [dashboard, setDashboard] = useState<SalesDashboard | null>(null);
  const [sales, setSales] = useState<SalesList["items"]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [clock, setClock] = useState<string>("");
  const periodRef = useRef<string | null>(null);

  // Relógio ao vivo
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    try {
      const cfg = config ?? (await salesAdminConfigurationRequest<SalesAdminConfiguration>("/api/vendas/admin/configuration"));
      if (!config) setConfig(cfg);
      const period = cfg.periods.find((p) => p.status === "OPEN") ?? cfg.periods[0];
      if (!period) { setError("Nenhum período configurado."); setReady(true); return; }
      periodRef.current = period.id;
      const [dash, allSales] = await Promise.all([
        salesAdminConfigurationRequest<SalesDashboard>(`/api/vendas/admin/dashboard?period=${period.id}`),
        fetchAllSales(period.id),
      ]);
      setDashboard(dash);
      setSales(allSales);
      setError(null);
      setReady(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Painel indisponível.");
      setReady(true);
    }
  }, [config]);

  useEffect(() => { void load(); const id = setInterval(() => void load(), REFRESH_MS); return () => clearInterval(id); }, [load]);

  const period = config?.periods.find((p) => p.id === periodRef.current) ?? null;
  const collectiveGoal = config?.goals.find((g) => g.scope === "COLLECTIVE" && g.isActive) ?? config?.goals.find((g) => g.scope === "COLLECTIVE");
  const realized = dashboard?.realized ?? {};
  const realizedValue = num(realized["realized_value"]);
  const collectiveTarget = num(collectiveGoal?.targetValue);
  const collectivePct = collectiveTarget > 0 ? (realizedValue / collectiveTarget) * 100 : 0;

  // Série diária (acumulada) a partir das vendas CLOSED do período
  const daily: DayPoint[] = useMemo(() => {
    if (!period) return [];
    const byDay = new Map<string, number>();
    for (const s of sales) {
      if (s.status !== "CLOSED") continue;
      const d = String(s.sold_at).slice(0, 10);
      byDay.set(d, (byDay.get(d) ?? 0) + (num(s.sale_value) - num(s.discount_value)));
    }
    const start = new Date(`${period.startsOn}T00:00:00Z`);
    const end = new Date(`${period.endsOn}T00:00:00Z`);
    const today = new Date();
    const out: DayPoint[] = [];
    let acc = 0;
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      const v = byDay.get(iso) ?? 0;
      acc += v;
      // só desenha até hoje (evita reta plana no futuro)
      if (d.getTime() <= today.getTime() + 86400000) out.push({ label: iso.slice(8, 10) + "/" + iso.slice(5, 7), day: out.length + 1, diario: v, acumulado: acc });
    }
    return out;
  }, [sales, period]);

  const ranking = dashboard?.ranking ?? [];
  const maxRank = Math.max(...ranking.map((r) => num(r.realized_value)), 1);
  const installments = useMemo(() => {
    const map = new Map<number, { label: string; valor: number }>();
    for (const it of dashboard?.installments.closed ?? []) map.set(it.installments, { label: `${it.installments}x`, valor: num(it.value) });
    return Array.from(map.values()).sort((a, b) => parseInt(a.label) - parseInt(b.label));
  }, [dashboard]);

  const gaugeState = paceFromPercent(collectivePct);

  if (!ready) {
    return <div className="grid min-h-dvh place-items-center bg-background text-muted-foreground">Carregando painel ao vivo…</div>;
  }
  if (error) {
    return <div className="grid min-h-dvh place-items-center bg-background"><div className="rounded-2xl border border-border bg-card p-8 text-center"><p className="text-lg font-semibold">Painel indisponível</p><p className="mt-1 text-sm text-muted-foreground">{error}</p></div></div>;
  }

  return (
    <main className="tv-premium min-h-dvh overflow-x-hidden bg-background p-4 text-foreground sm:p-6 lg:p-8">
      <div className="mx-auto flex min-h-[calc(100dvh-2rem)] max-w-[1600px] flex-col gap-4">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">LISION Vendas · Painel ao vivo</p>
            <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Desempenho comercial</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-70" /><span className="relative inline-flex size-2 rounded-full bg-emerald-500" /></span>
              AO VIVO
            </span>
            {period && <span className="text-sm text-muted-foreground">{period.startsOn} a {period.endsOn}</span>}
            <span className="font-display text-2xl font-bold tabular-nums">{clock}</span>
          </div>
        </header>

        {/* Linha herói: meta coletiva + KPIs animados */}
        <section className="grid gap-4 lg:grid-cols-[minmax(320px,1fr)_2fr]">
          <Panel className="flex flex-col items-center justify-center gap-2 py-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Meta coletiva</p>
            <RadialGauge produced={Math.round(collectivePct)} target={100} percent={collectivePct} unit="%" state={gaugeState} />
            <p className="text-sm text-muted-foreground">{money(realizedValue)} <span className="opacity-60">/ {money(collectiveTarget)}</span></p>
          </Panel>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-2">
            <BigStat label="Total vendido" value={realizedValue} format={moneyFull} highlight />
            <BigStat label="Comissão acumulada" value={num(realized["commission_value"])} format={moneyFull} />
            <BigStat label="Vendas realizadas" value={num(realized["sales_count"])} format={int} />
            <BigStat label="Peças vendidas" value={num(realized["pieces_total"])} format={int} />
          </div>
        </section>

        {/* Onda: acumulado do período */}
        <Panel className="min-h-0">
          <div className="mb-2 flex items-baseline justify-between">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Faturamento acumulado no período</p>
            <p className="text-sm text-muted-foreground">Ticket médio {money(dashboard?.tickets.sale)} · por peça {money(dashboard?.tickets.piece)}</p>
          </div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="salesWave" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--foreground)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--foreground)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--foreground)" strokeOpacity={0.07} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis tickFormatter={moneyShort} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={52} />
                <Tooltip content={<WaveTooltip />} cursor={{ stroke: "var(--foreground)", strokeOpacity: 0.15 }} />
                <Area type="monotone" dataKey="acumulado" stroke="var(--foreground)" strokeWidth={2.5} fill="url(#salesWave)" isAnimationActive animationDuration={900} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        {/* Linha inferior: diário (linhas) + ranking + parcelas */}
        <section className="grid gap-4 lg:grid-cols-3">
          <Panel>
            <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Vendas por dia</p>
            <div style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={daily} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--foreground)" strokeOpacity={0.07} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} minTickGap={24} />
                  <YAxis tickFormatter={moneyShort} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={48} />
                  <Tooltip content={<WaveTooltip dataKey="diario" />} cursor={{ stroke: "var(--foreground)", strokeOpacity: 0.15 }} />
                  <Line type="monotone" dataKey="diario" stroke="var(--foreground)" strokeWidth={2} dot={{ r: 2, fill: "var(--foreground)" }} isAnimationActive animationDuration={900} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel>
            <p className="mb-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Ranking de consultoras</p>
            <div className="space-y-2.5">
              {ranking.length === 0 && <p className="text-sm text-muted-foreground">Sem realizado ainda.</p>}
              {ranking.slice(0, 6).map((r, i) => {
                const v = num(r.realized_value);
                const pct = Math.max(3, Math.round((v / maxRank) * 100));
                return (
                  <div key={r.profile_id} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2"><span className="grid size-5 shrink-0 place-items-center rounded bg-foreground text-[10px] font-bold text-background">{int(r.position)}</span><span className="truncate">{r.display_name ?? "Consultora"}</span></span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{money(v)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-foreground/10"><div className={`h-full rounded-full transition-[width] duration-700 ${i === 0 ? "bg-foreground" : "bg-foreground/50"}`} style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel className="flex flex-col">
            <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Parcelamentos</p>
            {installments.length === 0 ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Sem vendas parceladas.</div>
            ) : (
              <div style={{ height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={installments} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={moneyShort} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={48} />
                    <Tooltip cursor={{ fill: "var(--foreground)", fillOpacity: 0.06 }} content={<WaveTooltip dataKey="valor" />} />
                    <Bar dataKey="valor" fill="var(--foreground)" radius={[6, 6, 0, 0]} maxBarSize={44} isAnimationActive animationDuration={800} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>
        </section>

        {/* Rodapé: mini-anéis de ritmo + pipeline */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <RingTile label="Meta coletiva" percent={collectivePct} />
          <BigStat label="Pipeline em aberto" value={num(dashboard?.pipeline.value)} format={moneyFull} compact />
          <BigStat label="Fretes" value={num(realized["freight_total"])} format={moneyFull} compact />
          <BigStat label="Descontos" value={num(realized["discount_total"])} format={moneyFull} compact />
        </section>
      </div>
    </main>
  );
}

/* ── Subcomponentes ── */

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-[20px] border border-border bg-card p-4 shadow-[0_20px_40px_-24px_rgba(0,0,0,0.6)] sm:p-5 ${className ?? ""}`}>{children}</div>;
}

function BigStat({ label, value, format, highlight, compact }: { label: string; value: number; format: (v: number) => string; highlight?: boolean; compact?: boolean }) {
  return (
    <div className={`relative flex flex-col justify-center gap-1 rounded-[20px] border p-4 sm:p-5 ${highlight ? "border-foreground/25 bg-foreground/[0.04]" : "border-border bg-card"}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <span className={`font-display font-bold tabular-nums text-foreground ${compact ? "text-[clamp(1.3rem,2vw,1.7rem)]" : highlight ? "text-[clamp(1.8rem,3vw,2.8rem)]" : "text-[clamp(1.5rem,2.4vw,2.1rem)]"}`}>
        <CountUp value={value} format={format} />
      </span>
    </div>
  );
}

function RingTile({ label, percent }: { label: string; percent: number }) {
  return (
    <div className="flex items-center gap-4 rounded-[20px] border border-border bg-card p-4 sm:p-5">
      <MiniRing label={label} percent={percent} />
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        <p className="font-display text-2xl font-bold tabular-nums">{percent.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</p>
      </div>
    </div>
  );
}

function WaveTooltip({ active, payload, label, dataKey = "acumulado" }: { active?: boolean; payload?: Array<{ payload: Record<string, unknown> }>; label?: string; dataKey?: string }) {
  if (!active || !payload?.length) return null;
  const v = Number(payload[0].payload[dataKey]) || 0;
  return (
    <div className="rounded-xl border border-foreground/15 bg-foreground/[0.06] px-3 py-2 shadow-lg backdrop-blur-md">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-[14px] font-semibold tabular-nums">{moneyFull(v)}</div>
    </div>
  );
}

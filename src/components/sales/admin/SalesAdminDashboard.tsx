"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { salesAdminConfigurationRequest } from "@/components/sales/admin/SalesAdminConfiguration";
import { Button } from "@/components/ui/button";
import { KpiCard, KpiLabel, KpiValue, KpiSupport } from "@/components/ui/kpi-card";
import { CountUp } from "@/components/ui/count-up";
import { SectionHeader } from "@/components/ui/section-header";
import { MiniRing } from "@/components/tv/instrument/MiniRing";
import { paceFromPercent, STATE_COLORS } from "@/components/tv/instrument/state";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { SalesAdminConfiguration, SalesGoalRecord } from "@/lib/sales-admin-configuration";
import type { SalesAdminDirectoryEntry } from "@/lib/sales-admin";
import type { SalesDashboard, SalesList } from "@/lib/sales-admin-sales";

const money = (value: unknown) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);
const num = (value: unknown) => Number(value) || 0;
const moneyShort = (value: unknown) => {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1000) return `R$ ${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
  return money(n);
};
const number = (value: unknown) => new Intl.NumberFormat("pt-BR").format(Number(value) || 0);
const metric = (record: Record<string, unknown>, key: string) => record[key] ?? 0;
const dayLabel = (iso: string) => { const [, m, d] = iso.split("-"); return `${d}/${m}`; };

type TrendPoint = { date: string; label: string; realizado: number };

export function SalesAdminDashboard() {
  const router = useRouter(); const search = useSearchParams();
  const [configuration, setConfiguration] = useState<SalesAdminConfiguration | null>(null);
  const [directory, setDirectory] = useState<SalesAdminDirectoryEntry[]>([]); const [data, setData] = useState<SalesDashboard | null>(null);
  const [error, setError] = useState<string | null>(null); const [warning, setWarning] = useState<string | null>(null); const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      // P4: garante o período do mês corrente aberto (se o toggle estiver ligado). Tolerante a falha.
      await salesAdminConfigurationRequest("/api/vendas/admin/ensure-period", { method: "POST" }).catch(() => {});
      const [config, people] = await Promise.all([salesAdminConfigurationRequest<SalesAdminConfiguration>("/api/vendas/admin/configuration"), salesAdminConfigurationRequest<SalesAdminDirectoryEntry[]>("/api/vendas/admin/directory")]);
      setConfiguration(config); setDirectory(people);
      const requestedPeriod = search.get("period"); const requestedConsultant = search.get("consultant");
      const period = config.periods.find((item) => item.id === requestedPeriod) ?? config.periods.find((item) => item.status === "OPEN") ?? config.periods[0];
      const consultants = people.filter((item) => item.salesRole === "CONSULTANT" && item.membershipIsActive);
      const consultant = consultants.find((item) => item.profileId === requestedConsultant)?.profileId;
      if (!period) { setData(null); return; }
      const normalized = new URLSearchParams(); normalized.set("period", period.id); if (consultant) normalized.set("consultant", consultant);
      if (normalized.toString() !== search.toString()) { setWarning("Filtros inválidos foram restaurados para uma seleção segura."); router.replace(`?${normalized}`); }
      setData(await salesAdminConfigurationRequest<SalesDashboard>(`/api/vendas/admin/dashboard?${normalized}`));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Dashboard indisponível."); } finally { setLoading(false); }
  }, [router, search]);
  useEffect(() => void load(), [load]);

  // Tendência diária (DASH-1): derivada da lista de vendas CLOSED do período,
  // acumulada por dia. Busca paginada com teto de segurança (20 páginas).
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const periodId = data?.period_id ?? null;
  const consultantId = data?.consultant_profile_id ?? null;
  useEffect(() => {
    if (!periodId) { setTrend([]); return; }
    let cancelled = false;
    setTrendLoading(true);
    (async () => {
      try {
        const items: SalesList["items"] = [];
        for (let page = 1; page <= 20; page++) {
          const qs = new URLSearchParams({ period: periodId, status: "CLOSED", sort: "sold_at", direction: "asc", page: String(page) });
          if (consultantId) qs.set("consultant", consultantId);
          const res = await salesAdminConfigurationRequest<SalesList>(`/api/vendas/admin/sales?${qs}`);
          items.push(...res.items);
          if (res.items.length < res.page_size || items.length >= Number(res.total)) break;
        }
        if (cancelled) return;
        const byDay = new Map<string, number>();
        for (const it of items) {
          const day = String(it.sold_at).slice(0, 10);
          const net = (Number(it.sale_value) || 0) - (Number(it.discount_value) || 0);
          byDay.set(day, (byDay.get(day) ?? 0) + net);
        }
        let acc = 0;
        const series = Array.from(byDay.keys()).sort().map((day) => { acc += byDay.get(day) ?? 0; return { date: day, label: dayLabel(day), realizado: acc }; });
        setTrend(series);
      } catch { if (!cancelled) setTrend([]); } finally { if (!cancelled) setTrendLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [periodId, consultantId]);

  // Comparação entre vendedoras (L3) — busca o dashboard de uma 2ª consultora no mesmo período.
  const [compareId, setCompareId] = useState("");
  const [compareData, setCompareData] = useState<SalesDashboard | null>(null);
  useEffect(() => {
    if (!compareId || !periodId) { setCompareData(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const qs = new URLSearchParams({ period: periodId, consultant: compareId });
        const d = await salesAdminConfigurationRequest<SalesDashboard>(`/api/vendas/admin/dashboard?${qs}`);
        if (!cancelled) setCompareData(d);
      } catch { if (!cancelled) setCompareData(null); }
    })();
    return () => { cancelled = true; };
  }, [compareId, periodId]);

  function change(name: "period" | "consultant", value: string) { const next = new URLSearchParams(search); if (value) next.set(name, value); else next.delete(name); router.push(`?${next}`); }
  const consultantName = (id: string | null | undefined) => id ? (directory.find((d) => d.profileId === id)?.fullName ?? "Consultora") : "Coletivo";
  const currentPeriod = configuration?.periods.find((item) => item.id === data?.period_id);
  const realized = data?.realized ?? {};
  const realizedValue = num(metric(realized, "realized_value"));
  // Anéis de progresso das metas (DASH-3): metas ativas do escopo em foco
  // (consultora → individuais; coletivo → coletivas) comparadas ao realizado.
  const goalScope = data?.consultant_profile_id ? "INDIVIDUAL" : "COLLECTIVE";
  const goalRings = (configuration?.goals ?? []).filter((g) => g.isActive && g.scope === goalScope && g.targetValue > 0).sort((a, b) => a.sortOrder - b.sortOrder);
  const topTarget = goalRings.length ? Math.min(...goalRings.map((g) => g.targetValue)) : 0;
  const hitGoals = goalRings.filter((g) => realizedValue >= g.targetValue);

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="LISION Vendas" title="Dashboard comercial" description="Indicadores canônicos do coletivo e das consultoras." className="items-start max-sm:flex-col">
        <div className="flex flex-wrap gap-2">
          <Button asChild className="min-h-11"><Link href="/vendas/admin/vendas">Gerenciar vendas</Link></Button>
          <Button asChild variant="outline" className="min-h-11"><Link href="/vendas/admin/vendas/nova">Nova venda</Link></Button>
        </div>
      </PageHeader>

      {warning && <p role="status" className="rounded-lg border border-border/60 bg-secondary/30 p-3 text-sm text-muted-foreground">{warning}</p>}
      {error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error} <Button variant="link" onClick={() => void load()}>Tentar novamente</Button></div>}

      {/* Filtros — período, consultora e comparação (L3) */}
      <div className="grid gap-4 rounded-[20px] border border-border bg-card p-5 shadow-[0_20px_40px_-24px_rgba(0,0,0,0.6)] sm:grid-cols-3">
        <div>
          <Label htmlFor="dashboard-period" className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Período (mês)</Label>
          <select id="dashboard-period" className="input-field mt-1.5" value={data?.period_id ?? ""} onChange={(event) => change("period", event.target.value)}>
            {configuration?.periods.map((item) => <option key={item.id} value={item.id}>{item.startsOn} a {item.endsOn} · {item.status === "OPEN" ? "Aberto" : "Encerrado"}</option>)}
          </select>
        </div>
        <div>
          <Label htmlFor="dashboard-consultant" className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Consultora</Label>
          <select id="dashboard-consultant" className="input-field mt-1.5" value={data?.consultant_profile_id ?? ""} onChange={(event) => change("consultant", event.target.value)}>
            <option value="">Coletivo</option>
            {directory.filter((item) => item.salesRole === "CONSULTANT" && item.membershipIsActive).map((item) => <option key={item.profileId} value={item.profileId}>{item.fullName ?? "Consultora"}</option>)}
          </select>
        </div>
        <div>
          <Label htmlFor="dashboard-compare" className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Comparar com</Label>
          <select id="dashboard-compare" className="input-field mt-1.5" value={compareId} onChange={(event) => setCompareId(event.target.value)}>
            <option value="">— sem comparação —</option>
            {directory.filter((item) => item.salesRole === "CONSULTANT" && item.membershipIsActive && item.profileId !== data?.consultant_profile_id).map((item) => <option key={item.profileId} value={item.profileId}>{item.fullName ?? "Consultora"}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-[20px]" />)}</div>
      ) : !data ? (
        <div className="rounded-[20px] border border-border bg-card p-10 text-center text-muted-foreground">Nenhum período disponível. Configure um período em <Link href="/vendas/admin/periodos" className="underline">Períodos</Link>.</div>
      ) : (
        <>
          {currentPeriod?.status === "CLOSED" && <p className="rounded-lg border border-border/60 bg-secondary/30 p-3 text-sm text-muted-foreground">Histórico estável · período encerrado</p>}

          {hitGoals.length > 0 && (
            <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-success/40 bg-success/10 p-4">
              <span className="text-2xl" aria-hidden>🎉</span>
              <div>
                <p className="font-display text-lg font-semibold text-success">Parabéns! {hitGoals.length === 1 ? "Meta batida" : `${hitGoals.length} metas batidas`}{data.consultant_profile_id ? " pela consultora" : " pelo coletivo"}.</p>
                <p className="text-sm text-muted-foreground">{hitGoals.map((g) => `${g.name} (${money(g.targetValue)})`).join(" · ")}</p>
              </div>
            </div>
          )}

          {compareData && (
            <>
              <SectionHeader label="Comparativo" />
              <ComparisonCard aName={consultantName(data.consultant_profile_id)} a={data} bName={consultantName(compareId)} b={compareData} />
            </>
          )}

          <SectionHeader label="Visão geral" className="mt-1" />

          {/* Realizado — herói + KPIs */}
          <section aria-labelledby="realized-title" className="space-y-4">
            <SectionTitle id="realized-title" title="Realizado" hint="vendas CLOSED" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat index={0} highlight label="Total vendido" value={num(metric(realized, "realized_value"))} format={money} support={`${number(metric(realized, "sales_count"))} venda(s)`} />
              <Stat index={1} label="Comissão acumulada" value={num(metric(realized, "commission_value"))} format={money} />
              <Stat index={2} label="Ticket médio / venda" value={num(data.tickets.sale)} format={money} />
              <Stat index={3} label="Ticket médio / peça" value={num(data.tickets.piece)} format={money} />
              <Stat index={4} label="Peças vendidas" value={num(metric(realized, "pieces_total"))} format={number} />
              <Stat index={5} label="Fretes" value={num(metric(realized, "freight_total"))} format={money} />
              <Stat index={6} label="Descontos" value={num(metric(realized, "discount_total"))} format={money} />
              <Stat index={7} label="Vendas" value={num(metric(realized, "sales_count"))} format={number} />
            </div>
          </section>

          {/* Evolução do realizado — gráfico de tendência em destaque (DASH-1) */}
          <SectionHeader label="Evolução do período" />
          <section aria-labelledby="trend-title" className="space-y-4">
            <SectionTitle id="trend-title" title="Realizado acumulado" hint={consultantId ? "consultora" : "coletivo"} />
            <TrendChart data={trend} loading={trendLoading} target={topTarget} targetLabel={goalRings[0]?.name} />
          </section>

          {/* Progresso das metas — anéis (DASH-3) */}
          {goalRings.length > 0 && (
            <>
              <SectionHeader label="Progresso das metas" />
              <section aria-labelledby="goals-title" className="space-y-4">
                <SectionTitle id="goals-title" title={goalScope === "COLLECTIVE" ? "Metas coletivas" : "Metas individuais"} hint="realizado vs meta" />
                <GoalRings goals={goalRings} realized={realizedValue} />
              </section>
            </>
          )}

          {/* Pipeline + gráfico de parcelamentos */}
          <SectionHeader label="Pipeline & parcelamentos" />
          <section aria-labelledby="pipeline-title" className="space-y-4">
            <SectionTitle id="pipeline-title" title="Pipeline & parcelamentos" hint="OPEN vs CLOSED" />
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.6fr)]">
              <Stat index={0} label="Valor em aberto" value={num(data.pipeline.value)} format={money} support={`${number(data.pipeline.sales_count)} venda(s) · ${number(data.pipeline.pieces_total)} peças em pipeline`} />
              <InstallmentsChart closed={data.installments.closed} open={data.installments.open} />
            </div>
          </section>

          {/* Ranking com barras proporcionais */}
          <section aria-labelledby="ranking-title" className="space-y-4">
            <SectionTitle id="ranking-title" title="Ranking realizado" hint="por valor" />
            <RankingChart items={data.ranking} />
          </section>
        </>
      )}
    </div>
  );
}

/* ── Subcomponentes de apresentação (reúso do KpiCard do Lision) ── */

function SectionTitle({ id, title, hint }: { id: string; title: string; hint?: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <h2 id={id} className="font-display text-xl font-semibold tracking-tight">{title}</h2>
      {hint && <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{hint}</span>}
    </div>
  );
}

function Stat({ label, value, format, support, highlight, index }: { label: string; value: number; format: (n: number) => string; support?: string; highlight?: boolean; index?: number }) {
  return (
    <KpiCard highlight={highlight} interactive index={index} className="flex flex-col justify-between gap-3">
      <KpiLabel>{label}</KpiLabel>
      <div>
        {/* Valor animado (CountUp) como no dashboard do Lision — nowrap + tamanho contido. */}
        <KpiValue className={cn("whitespace-nowrap", highlight ? "text-[clamp(1.5rem,2vw,2rem)]" : "text-[clamp(1.35rem,1.7vw,1.75rem)]")}>
          <CountUp value={value} format={format} />
        </KpiValue>
        {support && <KpiSupport className="mt-1">{support}</KpiSupport>}
      </div>
    </KpiCard>
  );
}

function ChartTooltip({ active, payload, label, formatter }: { active?: boolean; payload?: Array<{ value: number; payload?: Record<string, unknown> }>; label?: string; formatter: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-foreground/15 bg-foreground/[0.06] px-3 py-2 shadow-lg backdrop-blur-md">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-[14px] font-semibold tabular-nums">{formatter(payload[0].value)}</div>
    </div>
  );
}

function TrendChart({ data, loading, target, targetLabel }: { data: TrendPoint[]; loading: boolean; target: number; targetLabel?: string }) {
  return (
    <KpiCard className="flex flex-col">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <KpiLabel>Realizado acumulado por dia</KpiLabel>
        {target > 0 && <span className="text-[11px] text-muted-foreground">meta {targetLabel ?? ""}: {moneyShort(target)}</span>}
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground" style={{ height: 340 }}>Carregando evolução…</div>
      ) : data.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground" style={{ height: 340 }}>Nenhuma venda realizada neste período ainda.</div>
      ) : (
        <div style={{ height: 340 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--foreground)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--foreground)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--foreground)" strokeOpacity={0.06} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} minTickGap={16} />
              <YAxis tickFormatter={(v) => moneyShort(v)} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={52} />
              <Tooltip cursor={{ stroke: "var(--foreground)", strokeOpacity: 0.15 }} content={<ChartTooltip formatter={money} />} />
              {target > 0 && <ReferenceLine y={target} stroke="var(--foreground)" strokeOpacity={0.4} strokeDasharray="4 4" />}
              <Area type="monotone" dataKey="realizado" stroke="var(--foreground)" strokeWidth={2.5} fill="url(#trend-fill)" isAnimationActive animationDuration={800} dot={data.length <= 12} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </KpiCard>
  );
}

function GoalRings({ goals, realized }: { goals: SalesGoalRecord[]; realized: number }) {
  return (
    <KpiCard className="flex flex-wrap items-start justify-around gap-x-6 gap-y-4 py-6">
      {goals.map((goal) => {
        const percent = goal.targetValue > 0 ? (realized / goal.targetValue) * 100 : 0;
        const state = STATE_COLORS[paceFromPercent(percent)];
        const remaining = Math.max(0, goal.targetValue - realized);
        return (
          <div key={goal.id} className="flex min-w-[128px] flex-col items-center gap-1 text-center">
            <MiniRing label={goal.name} percent={percent} />
            <span className="text-[11px] tabular-nums" style={{ color: state.main }}>
              {money(realized)} / {moneyShort(goal.targetValue)}
            </span>
            <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              {remaining > 0 ? `faltam ${moneyShort(remaining)}` : "meta batida"}
              {goal.commissionPercent > 0 ? ` · ${number(goal.commissionPercent)}%` : ""}
            </span>
          </div>
        );
      })}
    </KpiCard>
  );
}

function ComparisonCard({ aName, a, bName, b }: { aName: string; a: SalesDashboard; bName: string; b: SalesDashboard }) {
  const g = (d: SalesDashboard, key: string) => num(metric(d.realized, key));
  const rows: Array<{ label: string; av: number; bv: number; fmt: (n: number) => string }> = [
    { label: "Total realizado", av: g(a, "realized_value"), bv: g(b, "realized_value"), fmt: money },
    { label: "Comissão", av: g(a, "commission_value"), bv: g(b, "commission_value"), fmt: money },
    { label: "Vendas", av: g(a, "sales_count"), bv: g(b, "sales_count"), fmt: number },
    { label: "Peças", av: g(a, "pieces_total"), bv: g(b, "pieces_total"), fmt: number },
    { label: "Ticket médio / venda", av: num(a.tickets.sale), bv: num(b.tickets.sale), fmt: money },
    { label: "Ticket médio / peça", av: num(a.tickets.piece), bv: num(b.tickets.piece), fmt: money },
  ];
  return (
    <KpiCard className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 text-left">
            <th className="p-3 font-medium text-muted-foreground">Métrica</th>
            <th className="p-3 font-semibold">{aName}</th>
            <th className="p-3 font-semibold">{bName}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-border/30">
              <td className="p-3 text-muted-foreground">{r.label}</td>
              <td className={cn("p-3 tabular-nums", r.av >= r.bv && r.av > 0 && "font-semibold text-success")}>{r.fmt(r.av)}</td>
              <td className={cn("p-3 tabular-nums", r.bv > r.av && r.bv > 0 && "font-semibold text-success")}>{r.fmt(r.bv)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </KpiCard>
  );
}

function InstallmentsChart({ closed, open }: { closed: SalesDashboard["installments"]["closed"]; open: SalesDashboard["installments"]["open"] }) {
  const byInstallment = new Map<number, { label: string; realizado: number; pipeline: number }>();
  for (const it of closed) byInstallment.set(it.installments, { label: `${it.installments}x`, realizado: Number(it.value) || 0, pipeline: 0 });
  for (const it of open) { const e = byInstallment.get(it.installments) ?? { label: `${it.installments}x`, realizado: 0, pipeline: 0 }; e.pipeline = Number(it.value) || 0; byInstallment.set(it.installments, e); }
  const rows = Array.from(byInstallment.values()).sort((a, b) => parseInt(a.label) - parseInt(b.label));
  const maxVal = Math.max(0, ...rows.flatMap((r) => [r.realizado, r.pipeline]));
  const yMax = maxVal > 0 ? maxVal * 1.15 : 1; // 15% de folga p/ a barra não bater no topo
  return (
    <KpiCard className="flex flex-col">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <KpiLabel className="mb-0">Parcelamentos · realizado vs. pipeline</KpiLabel>
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-foreground" /> Realizado</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-foreground/30" /> Pipeline</span>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height: 340 }}>Nenhuma venda parcelada neste período.</div>
      ) : (
        <div className="w-full" style={{ height: 340 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 16, right: 8, bottom: 4, left: 4 }} barGap={8} barCategoryGap="22%">
              <CartesianGrid vertical={false} stroke="var(--foreground)" strokeOpacity={0.06} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, yMax]} tickFormatter={(v) => moneyShort(v)} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={56} />
              <Tooltip cursor={{ fill: "var(--foreground)", fillOpacity: 0.06 }} content={<ChartTooltip formatter={money} />} />
              <Bar dataKey="realizado" fill="var(--foreground)" radius={[8, 8, 0, 0]} maxBarSize={72} isAnimationActive animationDuration={700} />
              <Bar dataKey="pipeline" fill="var(--foreground)" fillOpacity={0.3} radius={[8, 8, 0, 0]} maxBarSize={72} isAnimationActive animationDuration={700} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </KpiCard>
  );
}

function RankingChart({ items }: { items: SalesDashboard["ranking"] }) {
  if (!items.length) return <div className="rounded-[20px] border border-border bg-card p-8 text-center text-sm text-muted-foreground">Ainda não há realizado neste período.</div>;
  const max = Math.max(...items.map((i) => Number(i.realized_value) || 0), 1);
  return (
    <KpiCard className="space-y-3">
      {items.map((item, idx) => {
        const value = Number(item.realized_value) || 0;
        const pct = Math.max(2, Math.round((value / max) * 100));
        return (
          <div key={item.profile_id} className="space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 min-w-0">
                <span className="grid size-6 shrink-0 place-items-center rounded-md bg-foreground text-background text-[11px] font-semibold tabular-nums">{number(item.position)}</span>
                <span className="truncate font-medium">{item.display_name ?? "Consultora"}</span>
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{money(value)} · {number(item.sales_count)} vendas</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-foreground/10">
              <div className={cn("h-full rounded-full transition-[width] duration-700", idx === 0 ? "bg-foreground" : "bg-foreground/50")} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </KpiCard>
  );
}

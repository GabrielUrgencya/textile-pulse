"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { KpiCard, KpiLabel, KpiValue, KpiSupport } from "@/components/ui/kpi-card";
import { MiniRing } from "@/components/tv/instrument/MiniRing";
import { RadialGauge } from "@/components/tv/instrument/RadialGauge";
import { paceFromPercent, STATE_COLORS } from "@/components/tv/instrument/state";
import { SalesPodium, initials } from "@/components/sales/SalesPodium";
import { SectionHeader } from "@/components/ui/section-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import type { SalesCollective } from "@/lib/sales-collective";

const number = (value: unknown) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(
    Number(value) || 0,
  );
const money = (value: unknown) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(value) || 0,
  );
const pct = (value: unknown) => Number(value) || 0;

export function SalesCollectiveWorkspace() {
  const router = useRouter();
  const search = useSearchParams();
  const [data, setData] = useState<SalesCollective | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [offline, setOffline] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    addEventListener("online", sync);
    addEventListener("offline", sync);
    return () => {
      removeEventListener("online", sync);
      removeEventListener("offline", sync);
    };
  }, []);
  const safe = useMemo(() => {
    const next = new URLSearchParams();
    const key = search.get("periodKey");
    const month = Number(search.get("month"));
    const year = Number(search.get("year"));
    const page = Number(search.get("page") ?? 1);
    if (key && /^[0-9a-f]{64}$/.test(key)) next.set("periodKey", key);
    if (month >= 1 && month <= 12 && year >= 2000 && year <= 2200)
      next.set("month", String(month));
    if (year >= 2000 && year <= 2200) next.set("year", String(year));
    next.set("page", String(Number.isInteger(page) && page > 0 ? page : 1));
    next.set("pageSize", "25");
    return next;
  }, [search]);
  const load = useCallback(async () => {
    setLoading(true);
    setData(null);
    setError("");
    if (safe.toString() !== search.toString()) {
      setNotice("Filtros inválidos foram removidos");
      router.replace(`?${safe}`);
    }
    try {
      const response = await fetch(`/api/vendas/collective?${safe}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        data?: SalesCollective;
        error?: { message?: string };
      };
      if (!response.ok || !payload.data)
        throw new Error(
          payload.error?.message ?? "Painel coletivo indisponível.",
        );
      setData(payload.data);
      setNotice("Painel coletivo atualizado.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Painel coletivo indisponível.",
      );
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setLoading(false);
    }
  }, [router, safe, search]);
  useEffect(() => void load(), [load]);
  function change(key: string, value: string) {
    const next = new URLSearchParams(safe);
    if (value) next.set(key, value);
    else next.delete(key);
    next.set("page", "1");
    router.push(`?${next}`);
  }
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="LISION Vendas"
        title="Painel coletivo"
        description="Indicadores agregados e rankings sanitizados do seu tenant."
      />
      <div aria-live="polite" className="sr-only">
        {notice}
      </div>
      {offline && (
        <p
          role="alert"
          className="border-warning/30 bg-warning/10 rounded-lg border p-3"
        >
          Sem conexão
        </p>
      )}
      {error && (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border p-3"
        >
          {error}{" "}
          <Button variant="link" onClick={() => void load()}>
            Tentar novamente
          </Button>
        </div>
      )}
      <Filters
        data={data}
        search={safe}
        change={change}
        clear={() => router.push("/vendas/coletivo")}
      />
      {loading ? (
        <Loading />
      ) : data && !data.allowed ? (
        <Card>
          <CardContent className="p-6">
            <h2 className="text-xl font-semibold">
              Painel coletivo indisponível
            </h2>
            <p className="text-muted-foreground mt-2">
              Os agregados coletivos não estão autorizados para este tenant.
            </p>
          </CardContent>
        </Card>
      ) : data?.allowed ? (
        <Collective
          data={data}
          page={(value) => change("page", String(value))}
        />
      ) : null}
    </div>
  );
}

function Filters({
  data,
  search,
  change,
  clear,
}: {
  data: SalesCollective | null;
  search: URLSearchParams;
  change: (key: string, value: string) => void;
  clear: () => void;
}) {
  return (
    <div className="grid gap-4 rounded-[20px] border border-border bg-card p-5 shadow-[0_20px_40px_-24px_rgba(0,0,0,0.6)] sm:grid-cols-2 lg:grid-cols-3">
      <div>
        <Label htmlFor="collective-month" className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Mês</Label>
        <select
          id="collective-month"
          className="input-field mt-1.5"
          value={search.get("month") ?? ""}
          onChange={(e) => change("month", e.target.value)}
        >
          <option value="">Todos</option>
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {i + 1}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="collective-year" className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Ano</Label>
        <Input
          id="collective-year"
          className="input-field mt-1.5"
          inputMode="numeric"
          value={search.get("year") ?? ""}
          onChange={(e) => change("year", e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="collective-period" className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Período</Label>
        <select
          id="collective-period"
          className="input-field mt-1.5"
          value={search.get("periodKey") ?? ""}
          onChange={(e) => change("periodKey", e.target.value)}
        >
          <option value="">Mais recente</option>
          {data?.available_periods.map((period) => (
            <option key={period.key} value={period.key}>
              {period.starts_on} a {period.ends_on} ·{" "}
              {period.status === "OPEN"
                ? "Período aberto"
                : "Histórico · período encerrado"}
            </option>
          ))}
        </select>
      </div>
      <Button
        variant="outline"
        className="min-h-11 lg:col-span-3 lg:w-fit"
        onClick={clear}
      >
        Limpar filtros
      </Button>
    </div>
  );
}

function Loading() {
  return (
    <div
      role="status"
      aria-label="Carregando painel coletivo"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      {Array.from({ length: 8 }, (_, i) => (
        <Card key={i}>
          <CardContent className="min-h-24 p-4 motion-safe:animate-pulse" />
        </Card>
      ))}
    </div>
  );
}

function Metric({
  label,
  value,
  help,
}: {
  label: string;
  value: string;
  help?: string;
}) {
  return (
    <KpiCard interactive className="flex flex-col gap-2">
      <KpiLabel>{label}</KpiLabel>
      <KpiValue className="whitespace-nowrap text-[clamp(1.5rem,2.2vw,2rem)]">{value}</KpiValue>
      {help && <KpiSupport>{help}</KpiSupport>}
    </KpiCard>
  );
}

function Collective({
  data,
  page,
}: {
  data: Extract<SalesCollective, { allowed: true }>;
  page: (value: number) => void;
}) {
  const empty = Number(data.aggregates.sales_count) === 0;
  const hitGoals = data.goals.filter((g) => g.available && !g.suppressed && Number(g.progress_percent) >= 100);
  const achieved = pct(data.pace.achieved_percent);
  const ideal = pct(data.pace.ideal_pace_percent);
  const state = paceFromPercent(achieved);
  const metas = data.goals.filter((g) =>
    ["META_1", "META_2", "META_3"].includes(g.key),
  );
  const extras = data.goals.filter((g) =>
    ["CHALLENGE", "QUARTERLY", "COLLECTIVE"].includes(g.key),
  );
  return (
    <div className="space-y-8">
      {hitGoals.length > 0 && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-success/40 bg-success/10 p-4">
          <span className="text-2xl" aria-hidden>🎉</span>
          <div>
            <p className="font-display text-lg font-semibold text-success">Parabéns, equipe! Meta batida.</p>
            <p className="text-sm text-muted-foreground">
              {hitGoals.map((g) => `${g.label} (${number(g.progress_percent)}%)`).join(" · ")}
            </p>
          </div>
        </div>
      )}
      <p
        role="status"
        className="rounded-lg border border-border/60 bg-secondary/30 p-3 text-sm text-muted-foreground"
      >
        {data.period.status === "OPEN"
          ? "Período aberto · atualizado ao vivo"
          : "Histórico estável · período encerrado"}
      </p>

      {/* HERÓI — ritmo coletivo (RadialGauge reciclado da TV) */}
      <SectionHeader label="Ritmo coletivo" />
      <section aria-labelledby="pace" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <h2 id="pace" className="sr-only">Ritmo coletivo</h2>
        <KpiCard className="grid place-items-center py-4">
          <RadialGauge
            produced={Math.round(achieved)}
            target={Math.round(ideal)}
            percent={achieved}
            unit="%"
            state={state}
          />
          <p
            className="mt-1 text-[11px] font-medium uppercase tracking-[0.16em]"
            style={{ color: STATE_COLORS[state].main }}
          >
            {STATE_COLORS[state].label} · meta atingida vs ritmo ideal
          </p>
        </KpiCard>
        <div className="grid content-start gap-3 sm:grid-cols-2">
          <Metric label="Atingido" value={`${number(data.pace.achieved_percent)}%`} help="Do total da meta do período" />
          <Metric label="Ritmo ideal" value={`${number(data.pace.ideal_pace_percent)}%`} help="Onde deveríamos estar hoje" />
          <Metric label="Necessário por dia útil" value={`${number(data.pace.necessary_per_business_day_percent)}%`} help="Para cravar 100% no prazo" />
          <Metric
            label="Dias úteis restantes"
            value={number(data.pace.business_days_remaining)}
            help={
              data.pace.business_days_remaining === 0
                ? "Sem dias úteis aplicáveis"
                : "Até o fechamento do período"
            }
          />
        </div>
      </section>

      {/* METAS — mini-anéis */}
      <SectionHeader label="Metas do período" />
      <section aria-labelledby="goals" className="space-y-4">
        <h2 id="goals" className="sr-only">Metas</h2>
        <MetaRings goals={metas} />
        {extras.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {extras.map((goal) => (
              <Goal key={goal.key} goal={goal} />
            ))}
          </div>
        )}
      </section>

      {/* AGREGADOS operacionais */}
      <SectionHeader label="Agregados operacionais" />
      <section aria-labelledby="aggregates">
        <h2 id="aggregates" className="sr-only">Agregados operacionais</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Vendas realizadas"
            value={number(data.aggregates.sales_count)}
            help="Agregado do tenant neste período"
          />
          <Metric
            label="Peças realizadas"
            value={number(data.aggregates.pieces_total)}
            help="Agregado do tenant neste período"
          />
          {data.aggregates.freight_total !== undefined && (
            <Metric
              label="Frete total"
              value={money(data.aggregates.freight_total)}
              help="Soma dos fretes do tenant neste período"
            />
          )}
          <Metric
            label="Participação do frete"
            value={`${number(data.aggregates.freight_share_percent)}%`}
            help="Agregado do tenant neste período"
          />
        </div>
      </section>

      {empty && (
        <Card>
          <CardContent className="p-6">
            Nenhuma atividade coletiva autorizada neste período.
          </CardContent>
        </Card>
      )}

      {/* DISTRIBUIÇÕES — gráficos sanitizados */}
      <SectionHeader label="Distribuições sanitizadas" />
      <section className="grid gap-4 lg:grid-cols-2">
        <DistChart
          title="Distribuição de parcelamentos"
          items={data.installments.items}
          suppressed={data.installments.has_suppressed_buckets}
        />
        <DistChart
          title="Formas de pagamento"
          items={data.payment_methods.items}
          suppressed={data.payment_methods.has_suppressed_buckets}
        />
      </section>

      {/* RANKING de vendedoras — pódium + tabela */}
      <SectionHeader label="Ranking sanitizado de vendedoras" />
      <SellerRank rank={data.seller_ranking} page={page} />
    </div>
  );
}

function MetaRings({
  goals,
}: {
  goals: Array<Parameters<typeof Goal>[0]["goal"]>;
}) {
  const shown = goals.filter((g) => g.available && !g.suppressed);
  if (shown.length === 0) {
    return (
      <KpiCard className="flex items-center justify-center py-8 text-center text-sm text-muted-foreground">
        Metas suprimidas para preservar a privacidade do coletivo.
      </KpiCard>
    );
  }
  return (
    <KpiCard className="flex flex-wrap items-start justify-around gap-6 py-6">
      {goals.map((goal) => {
        const ok = goal.available && !goal.suppressed;
        return ok ? (
          <div key={goal.key} className="flex flex-col items-center gap-1">
            <MiniRing label={goal.label} percent={Number(goal.progress_percent) || 0} />
            <span className="text-[11px] text-muted-foreground">
              ideal {number(goal.ideal_pace_percent)}%
            </span>
          </div>
        ) : (
          <div key={goal.key} className="flex max-w-[140px] flex-col items-center gap-1 text-center opacity-50">
            <div className="grid size-[clamp(72px,9vh,104px)] place-items-center rounded-full border border-dashed border-border/60 text-[11px] text-muted-foreground">
              privado
            </div>
            <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{goal.label}</span>
          </div>
        );
      })}
    </KpiCard>
  );
}

function Goal({
  goal,
}: {
  goal: {
    key: string;
    label: string;
    available: boolean;
    suppressed: boolean;
    minimum_participants?: number;
    progress_percent: number | string | null;
    ideal_pace_percent: number | string | null;
    necessary_per_business_day_percent: number | string | null;
  };
}) {
  const shown = goal.available && !goal.suppressed;
  const p = Number(goal.progress_percent) || 0;
  return (
    <KpiCard interactive className="flex items-center gap-4">
      {shown && <MiniRing label={goal.label} percent={p} />}
      <div className="min-w-0 flex-1">
        <KpiLabel>{goal.label}</KpiLabel>
        {!shown ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Indicador suprimido para preservar privacidade
            {goal.minimum_participants ? ` · mínimo ${goal.minimum_participants} participantes` : ""}.
          </p>
        ) : (
          <>
            <KpiValue className="text-[clamp(1.6rem,2.4vw,2.2rem)]">{number(goal.progress_percent)}%</KpiValue>
            <KpiSupport className="mt-1">
              Ideal {number(goal.ideal_pace_percent)}% · nec./dia {number(goal.necessary_per_business_day_percent)}%
            </KpiSupport>
          </>
        )}
      </div>
    </KpiCard>
  );
}

function DistTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload?: { label?: string } }>;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-foreground/15 bg-foreground/[0.06] px-3 py-2 shadow-lg backdrop-blur-md">
      <div className="text-[11px] text-muted-foreground">{payload[0].payload?.label}</div>
      <div className="text-[14px] font-semibold tabular-nums">{number(payload[0].value)}%</div>
    </div>
  );
}

function DistChart({
  title,
  items,
  suppressed,
}: {
  title: string;
  suppressed: boolean;
  items: Array<{
    position: number;
    label: string;
    sales_percent: number | string;
    suppressed: boolean;
    tied?: boolean;
  }>;
}) {
  const rows = items.map((it) => ({ label: it.label, value: pct(it.sales_percent) }));
  return (
    <KpiCard className="flex h-full flex-col">
      <KpiLabel className="mb-1">{title}</KpiLabel>
      <p className="mb-3 text-[11px] text-muted-foreground">
        Ordenação no servidor · valores individuais não são exibidos.
      </p>
      {rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-10 text-sm text-muted-foreground">
          Nenhum agregado autorizado neste período.
        </div>
      ) : (
        <div className="min-h-0 flex-1" style={{ height: Math.max(160, rows.length * 44) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
              <XAxis type="number" domain={[0, 100]} hide />
              <YAxis
                type="category"
                dataKey="label"
                width={110}
                tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip cursor={{ fill: "var(--foreground)", fillOpacity: 0.06 }} content={<DistTooltip />} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={26} isAnimationActive animationDuration={700}>
                {rows.map((_, i) => (
                  <Cell key={i} fill="var(--foreground)" fillOpacity={i === 0 ? 1 : 0.4} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {suppressed && (
        <p role="status" className="mt-2 text-[11px] text-muted-foreground">
          Alguns buckets foram suprimidos para preservar privacidade.
        </p>
      )}
    </KpiCard>
  );
}

function SellerRank({
  rank,
  page,
}: {
  rank: Extract<SalesCollective, { allowed: true }>["seller_ranking"];
  page: (value: number) => void;
}) {
  return (
    <section>
      <p className="text-muted-foreground text-sm">
        Ordenação calculada no servidor; valores individuais não são exibidos.
      </p>
      {rank.suppressed ? (
        <Card>
          <CardContent className="p-6">
            Ranking suprimido para preservar privacidade
            {rank.minimum_team_size ? ` · mínimo ${rank.minimum_team_size} participantes` : ""}.
          </CardContent>
        </Card>
      ) : rank.items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            Nenhuma posição autorizada neste período.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Pódium do Lision (reciclado) — top-3 sanitizado */}
          <div className="mb-6 mt-4 overflow-x-auto pb-2">
            <SalesPodium
              entries={rank.items.slice(0, 3).map((item) => ({
                name: item.label,
                initials: initials(item.label),
                scoreText: `${number(item.contribution_percent)}%`,
              }))}
            />
          </div>
          <div className="mt-3 grid gap-3 md:hidden">
            {rank.items.map((item, i) => (
              <Card key={`${item.position}-${i}`}>
                <CardContent className="p-4">
                  <strong>{item.label}</strong>
                  <p>{number(item.contribution_percent)}%</p>
                  {item.tied && (
                    <p>
                      Empate na {item.position}ª posição; ordem estável definida
                      pelo servidor
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="p-3 text-left">Posição</th>
                  <th className="p-3 text-left">Percentual</th>
                  <th className="p-3 text-left">Situação</th>
                </tr>
              </thead>
              <tbody>
                {rank.items.map((item, i) => (
                  <tr className="border-t" key={`${item.position}-${i}`}>
                    <td className="p-3">{item.label}</td>
                    <td className="p-3 tabular-nums">
                      {number(item.contribution_percent)}%
                    </td>
                    <td className="p-3">
                      {item.tied
                        ? `Empate na ${item.position}ª posição`
                        : `${item.position}ª posição`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav
            aria-label={`Página ${rank.page}`}
            className="mt-3 flex items-center justify-between"
          >
            <Button
              variant="outline"
              disabled={rank.page <= 1}
              onClick={() => page(rank.page - 1)}
            >
              Anterior
            </Button>
            <span>Página {rank.page}</span>
            <Button
              variant="outline"
              disabled={rank.page * rank.page_size >= rank.total}
              onClick={() => page(rank.page + 1)}
            >
              Próxima
            </Button>
          </nav>
        </>
      )}
    </section>
  );
}

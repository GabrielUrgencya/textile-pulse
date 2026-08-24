"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard, KpiLabel, KpiValue, KpiSupport } from "@/components/ui/kpi-card";
import { MiniRing } from "@/components/tv/instrument/MiniRing";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import type {
  ConsultantCelebration,
  ConsultantDashboard,
  ConsultantPaymentMethod,
  ConsultantSale,
  ConsultantSalesList,
} from "@/lib/sales-consultant";

type FormState = {
  saleId: string | null;
  pvNumber: string;
  saleValue: string;
  freightValue: string;
  discountValue: string;
  paymentMethodId: string;
  installments: string;
  setsCount: string;
  loosePiecesCount: string;
  invoiceNumber: string;
  status: "OPEN" | "CLOSED";
  soldAt: string;
  expectedRevision: number;
  idempotencyKey: string;
};
type ApiError = Error & { code?: string };
type FieldErrors = Partial<Record<keyof FormState, string>>;
const DRAFT_KEY = "lision:sales:consultant:draft:v1";
const localDateTime = (value = new Date()) => {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};
const emptyForm = (): FormState => ({
  saleId: null,
  pvNumber: "",
  saleValue: "",
  freightValue: "0",
  discountValue: "0",
  paymentMethodId: "",
  installments: "1",
  setsCount: "0",
  loosePiecesCount: "0",
  invoiceNumber: "",
  status: "OPEN",
  soldAt: localDateTime(),
  expectedRevision: 0,
  idempotencyKey: crypto.randomUUID(),
});
const scrollTo = (element: HTMLElement | null) =>
  element?.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
    block: "start",
  });
const currency = (value: unknown) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(value) || 0,
  );
const numeric = (value: unknown) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(
    Number(value) || 0,
  );
const metric = (record: Record<string, unknown>, key: string) =>
  record[key] ?? 0;

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const payload = (await response.json()) as {
    data?: T;
    error?: { code?: string; message?: string };
  };
  if (!response.ok || payload.data === undefined) {
    const error = new Error(
      payload.error?.message ?? "Não foi possível concluir a operação.",
    ) as ApiError;
    error.code = payload.error?.code;
    throw error;
  }
  return payload.data;
}

export function SalesConsultantWorkspace() {
  const router = useRouter();
  const search = useSearchParams();
  const [dashboard, setDashboard] = useState<ConsultantDashboard | null>(null);
  const [sales, setSales] = useState<ConsultantSalesList | null>(null);
  const [methods, setMethods] = useState<ConsultantPaymentMethod[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState("");
  const [celebration, setCelebration] = useState<ConsultantCelebration | null>(
    null,
  );
  const formRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(DRAFT_KEY);
      setForm(saved ? (JSON.parse(saved) as FormState) : emptyForm());
    } catch {
      setForm(emptyForm());
    }
  }, []);
  useEffect(() => {
    if (form) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(form));
  }, [form]);
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
  useEffect(() => {
    if (!("BroadcastChannel" in window)) return;
    const channel = new BroadcastChannel("lision-sales-celebration");
    channel.onmessage = () => setCelebration(null);
    return () => channel.close();
  }, []);

  const safeFilters = useMemo(() => {
    const next = new URLSearchParams();
    const period = search.get("period");
    const month = Number(search.get("month"));
    const year = Number(search.get("year"));
    const status = search.get("status");
    const page = Number(search.get("page") ?? 1);
    if (period && /^[0-9a-f-]{36}$/i.test(period)) next.set("period", period);
    if (month >= 1 && month <= 12) next.set("month", String(month));
    if (year >= 2000 && year <= 2200) next.set("year", String(year));
    if (status === "OPEN" || status === "CLOSED") next.set("status", status);
    next.set("page", String(Number.isInteger(page) && page > 0 ? page : 1));
    return next;
  }, [search]);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (safeFilters.toString() !== search.toString()) {
        setNotice("Filtros inválidos foram removidos.");
        router.replace(`?${safeFilters}`);
      }
      const dashboardFilters = new URLSearchParams(safeFilters);
      dashboardFilters.delete("status");
      dashboardFilters.delete("page");
      const [nextDashboard, nextSales, nextMethods] = await Promise.all([
        request<ConsultantDashboard>(
          `/api/vendas/consultant/dashboard?${dashboardFilters}`,
        ),
        request<ConsultantSalesList>(
          `/api/vendas/consultant/sales?${safeFilters}`,
        ),
        request<ConsultantPaymentMethod[]>(
          "/api/vendas/consultant/payment-methods",
        ),
      ]);
      setDashboard(nextDashboard);
      setSales(nextSales);
      setMethods(nextMethods);
      if (nextDashboard.period_id) {
        const claimed = await request<ConsultantCelebration>(
          "/api/vendas/consultant/celebration",
          {
            method: "POST",
            body: JSON.stringify({ periodId: nextDashboard.period_id }),
          },
        );
        if (claimed.claimed) {
          setCelebration(claimed);
          if ("BroadcastChannel" in window) {
            const channel = new BroadcastChannel("lision-sales-celebration");
            channel.postMessage(claimed.goal_id);
            channel.close();
          }
        }
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Dados comerciais indisponíveis.",
      );
    } finally {
      setLoading(false);
    }
  }, [router, safeFilters, search]);
  useEffect(() => void load(), [load]);

  function changeFilter(key: string, value: string) {
    const next = new URLSearchParams(safeFilters);
    if (value) next.set(key, value);
    else next.delete(key);
    next.set("page", "1");
    router.push(`?${next}`);
  }
  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }
  function startNew() {
    setForm(emptyForm());
    setFormError("");
    requestAnimationFrame(() => scrollTo(formRef.current));
  }
  function edit(item: ConsultantSale) {
    setForm({
      saleId: item.id,
      pvNumber: item.pv_number,
      saleValue: String(item.sale_value),
      freightValue: String(item.freight_value),
      discountValue: String(item.discount_value),
      paymentMethodId: item.payment_method_id ?? "",
      installments: String(item.installments),
      setsCount: String(item.sets_count),
      loosePiecesCount: String(item.loose_pieces_count),
      invoiceNumber: item.invoice_number ?? "",
      status: item.status,
      soldAt: localDateTime(new Date(item.sold_at)),
      expectedRevision: Number(item.revision),
      idempotencyKey: crypto.randomUUID(),
    });
    setFormError("");
    requestAnimationFrame(() => scrollTo(formRef.current));
  }
  function validate(current: FormState) {
    const errors: FieldErrors = {};
    if (!current.pvNumber.trim()) errors.pvNumber = "Informe o PV.";
    if (!current.paymentMethodId)
      errors.paymentMethodId = "Selecione a forma de pagamento.";
    if (!current.soldAt) errors.soldAt = "Informe a data e hora.";
    if (!current.saleValue || Number(current.saleValue) < 0)
      errors.saleValue = "Informe um valor de venda válido.";
    if (Number(current.freightValue) < 0)
      errors.freightValue = "O frete não pode ser negativo.";
    if (
      Number(current.discountValue) < 0 ||
      Number(current.discountValue) > Number(current.saleValue)
    )
      errors.discountValue =
        "O desconto deve ficar entre zero e o valor da venda.";
    if (Number(current.installments) < 1)
      errors.installments = "Informe ao menos uma parcela.";
    if (Number(current.setsCount) < 0)
      errors.setsCount = "Conjuntos não podem ser negativos.";
    if (Number(current.loosePiecesCount) < 0)
      errors.loosePiecesCount = "Peças avulsas não podem ser negativas.";
    return errors;
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;
    const invalid = validate(form);
    if (Object.keys(invalid).length) {
      setFieldErrors(invalid);
      setFormError("Revise os campos indicados antes de salvar.");
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    setFieldErrors({});
    if (offline) {
      setFormError(
        "Sem conexão. O rascunho foi preservado; tente novamente quando a conexão voltar.",
      );
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const body = {
        ...form,
        saleValue: Number(form.saleValue),
        freightValue: Number(form.freightValue),
        discountValue: Number(form.discountValue),
        installments: Number(form.installments),
        setsCount: Number(form.setsCount),
        loosePiecesCount: Number(form.loosePiecesCount),
        soldAt: new Date(form.soldAt).toISOString(),
      };
      const result = await request<{ sale: ConsultantSale; outcome: string }>(
        form.saleId
          ? `/api/vendas/consultant/sales/${form.saleId}`
          : "/api/vendas/consultant/sales",
        { method: form.saleId ? "PUT" : "POST", body: JSON.stringify(body) },
      );
      setNotice(
        `${result.outcome === "updated" ? "Venda atualizada" : "Venda registrada"}: PV ${result.sale.pv_number} · ${result.sale.status === "OPEN" ? "Pipeline · OPEN" : "Realizado · CLOSED"}.`,
      );
      sessionStorage.removeItem(DRAFT_KEY);
      setForm(emptyForm());
      await load();
    } catch (cause) {
      const failure = cause as ApiError;
      setFormError(
        failure.code === "STALE_REVISION"
          ? "A venda foi atualizada em outro lugar. Seus campos locais não foram salvos. Recarregue o estado atual."
          : failure.message,
      );
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setSaving(false);
    }
  }
  async function reloadEdit() {
    if (!form?.saleId) return;
    try {
      edit(
        await request<ConsultantSale>(
          `/api/vendas/consultant/sales/${form.saleId}`,
        ),
      );
      setNotice("Estado atual recarregado.");
    } catch (cause) {
      setFormError(
        cause instanceof Error ? cause.message : "Venda indisponível.",
      );
    }
  }

  const realized = dashboard?.realized ?? {};
  const goals = Array.isArray(metric(realized, "goals"))
    ? (metric(realized, "goals") as Array<Record<string, unknown>>)
    : [];
  const regularGoals = goals
    .filter(
      (goal) =>
        String(goal.scope) === "INDIVIDUAL" && goal.is_challenge !== true,
    )
    .slice(0, 3);
  const challenges = goals.filter(
    (goal) => String(goal.scope) === "INDIVIDUAL" && goal.is_challenge === true,
  );
  const periods = (dashboard?.available_periods ?? []).map((period) => ({
    id: period.id,
    starts: period.starts_on,
    ends: period.ends_on,
    status: period.status,
  }));
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="LISION Vendas" title="Minha área de vendas">
        <Button className="min-h-11" onClick={startNew}>
          Nova venda
        </Button>
      </PageHeader>
      <p className="text-muted-foreground">
        Acompanhe seu período, registre vendas e consulte somente seus
        indicadores.
      </p>
      <div aria-live="polite" className="sr-only">
        {notice}
      </div>
      {notice && (
        <p
          role="status"
          className="border-success/30 bg-success/10 rounded-lg border p-3"
        >
          {notice}
        </p>
      )}
      {offline && (
        <p
          role="alert"
          className="border-warning/30 bg-warning/10 rounded-lg border p-3"
        >
          Sem conexão · seu rascunho continua salvo.
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border p-3"
        >
          {error}{" "}
          <Button variant="link" onClick={() => void load()}>
            Tentar novamente
          </Button>
        </div>
      )}
      {celebration?.claimed && (
        <Card aria-live="polite">
          <CardHeader>
            <CardTitle>Marco alcançado: {celebration.goal_name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p>Você alcançou um novo marco individual neste período.</p>
            <Button className="min-h-11" onClick={() => setCelebration(null)}>
              Continuar
            </Button>
          </CardContent>
        </Card>
      )}
      <Filters
        periods={periods}
        search={safeFilters}
        change={changeFilter}
        clear={() => router.push("/vendas/app")}
      />
      {loading ? (
        <LoadingState />
      ) : (
        dashboard && (
          <Dashboard
            dashboard={dashboard}
            realized={realized}
            regularGoals={regularGoals}
            challenges={challenges}
          />
        )
      )}
      {form && (
        <div ref={formRef}>
          <SaleForm
            form={form}
            methods={methods}
            saving={saving}
            error={formError}
            fieldErrors={fieldErrors}
            errorRef={errorRef}
            update={update}
            submit={submit}
            cancel={startNew}
            reload={reloadEdit}
          />
        </div>
      )}
      {!loading && (
        <SalesListView
          data={sales}
          edit={edit}
          page={(page) => changeFilter("page", String(page))}
        />
      )}
    </div>
  );
}

function Filters({
  periods,
  search,
  change,
  clear,
}: {
  periods: Array<{
    id: string;
    starts?: string;
    ends?: string;
    status?: string;
  }>;
  search: URLSearchParams;
  change: (key: string, value: string) => void;
  clear: () => void;
}) {
  return (
    <Card>
      <CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Select
          label="Mês"
          value={search.get("month") ?? ""}
          onChange={(value) => change("month", value)}
        >
          <option value="">Todos</option>
          {Array.from({ length: 12 }, (_, index) => (
            <option key={index + 1} value={index + 1}>
              {index + 1}
            </option>
          ))}
        </Select>
        <div>
          <Label htmlFor="sales-year">Ano</Label>
          <Input
            id="sales-year"
            className="mt-1 min-h-11"
            inputMode="numeric"
            value={search.get("year") ?? ""}
            onChange={(event) => change("year", event.target.value)}
          />
        </div>
        <Select
          label="Período"
          value={search.get("period") ?? ""}
          onChange={(value) => change("period", value)}
        >
          <option value="">Mais recente</option>
          {periods.map((period) => (
            <option key={period.id} value={period.id}>
              {period.starts} a {period.ends} ·{" "}
              {period.status === "OPEN" ? "Aberto" : "Encerrado"}
            </option>
          ))}
        </Select>
        <Select
          label="Status"
          value={search.get("status") ?? ""}
          onChange={(value) => change("status", value)}
        >
          <option value="">Todos</option>
          <option value="OPEN">Pipeline · OPEN</option>
          <option value="CLOSED">Realizado · CLOSED</option>
        </Select>
        <Button
          variant="outline"
          className="min-h-11 lg:col-span-4 lg:w-fit"
          onClick={clear}
        >
          Limpar filtros
        </Button>
      </CardContent>
    </Card>
  );
}
function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  const id = `sales-${label.toLowerCase().replace(/\W/g, "-")}`;
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className="border-input bg-background mt-1 min-h-11 w-full rounded-md border px-3"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </div>
  );
}
function LoadingState() {
  return (
    <div
      role="status"
      aria-label="Carregando indicadores"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      {Array.from({ length: 8 }, (_, index) => (
        <Card key={index}>
          <CardContent className="min-h-24 p-4 motion-safe:animate-pulse">
            <span className="sr-only">Carregando</span>
          </CardContent>
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
      <KpiValue className="whitespace-nowrap text-[clamp(1.4rem,2vw,1.9rem)]">{value}</KpiValue>
      {help && <KpiSupport>{help}</KpiSupport>}
    </KpiCard>
  );
}
function Dashboard({
  dashboard,
  realized,
  regularGoals,
  challenges,
}: {
  dashboard: ConsultantDashboard;
  realized: Record<string, unknown>;
  regularGoals: Array<Record<string, unknown>>;
  challenges: Array<Record<string, unknown>>;
}) {
  const closed = Number(metric(realized, "sales_count"));
  const pieces = Number(metric(realized, "pieces_total"));
  return (
    <div className="space-y-6">
      <section aria-labelledby="realized">
        <h2 id="realized" className="text-xl font-semibold">
          Realizado · vendas CLOSED
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Total realizado"
            value={currency(metric(realized, "realized_value"))}
          />
          <Metric
            label="Percentual de ritmo"
            value={`${numeric(metric(realized, "ideal_pace_percent"))}%`}
          />
          <Metric
            label="Comissão"
            value={currency(metric(realized, "commission_value"))}
            help="Conforme configuração do período"
          />
          <Metric
            label="Acumulado no ano"
            value={currency(dashboard.accumulated.realized_value)}
          />
        </div>
      </section>
      <section aria-labelledby="goal-rings">
        <h2 id="goal-rings" className="text-xl font-semibold">
          Progresso das metas
        </h2>
        <p className="text-muted-foreground text-sm">Seu avanço em cada meta — a cor responde antes do número (verde = no ritmo, âmbar = atenção, vermelho = abaixo).</p>
        <KpiCard className="mt-3 flex flex-wrap items-start justify-around gap-x-6 gap-y-4 py-6">
          {regularGoals.map((goal, index) => (
            <div key={String(goal.goal_id)} className="flex min-w-[120px] flex-col items-center gap-1 text-center">
              <MiniRing label={`Meta ${index + 1}`} percent={Number(goal.progress_percent) || 0} />
              <span className="text-[11px] text-muted-foreground">{currency(goal.target_value)}</span>
            </div>
          ))}
          {challenges.map((goal) => (
            <div key={String(goal.goal_id)} className="flex min-w-[120px] flex-col items-center gap-1 text-center">
              <MiniRing label="Desafio" percent={Number(goal.progress_percent) || 0} />
              <span className="text-[11px] text-muted-foreground">{currency(goal.target_value)}</span>
            </div>
          ))}
          <div className="flex min-w-[120px] flex-col items-center gap-1 text-center">
            <MiniRing label="Trimestral" percent={Number(dashboard.quarterly.progress_percent) || 0} />
            <span className="text-[11px] text-muted-foreground">{currency(dashboard.quarterly.target_value)}</span>
          </div>
          {dashboard.collective.allowed && (
            <div className="flex min-w-[120px] flex-col items-center gap-1 text-center">
              <MiniRing label="Coletiva" percent={Number(dashboard.collective.progress_percent) || 0} />
              <span className="text-[11px] text-muted-foreground">sua contribuição</span>
            </div>
          )}
        </KpiCard>
      </section>
      <section aria-labelledby="goals">
        <h2 id="goals" className="text-xl font-semibold">
          Metas e ritmo
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {regularGoals.length ? (
            regularGoals.map((goal, index) => (
              <Metric
                key={String(goal.goal_id)}
                label={`Meta ${index + 1} · ${String(goal.name)}`}
                value={`${numeric(goal.progress_percent)}%`}
                help={`${currency(goal.target_value)} · necessário/dia útil ${currency(goal.required_per_business_day)}`}
              />
            ))
          ) : (
            <Metric
              label="Metas individuais"
              value="0%"
              help="Nenhuma meta configurada neste período"
            />
          )}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {challenges.map((goal) => (
            <Metric
              key={String(goal.goal_id)}
              label={`Desafio · ${String(goal.name)}`}
              value={`${numeric(goal.progress_percent)}%`}
              help={currency(goal.target_value)}
            />
          ))}
          <Metric
            label={`Trimestral · ${dashboard.quarterly.quarter}º trimestre`}
            value={`${numeric(dashboard.quarterly.progress_percent)}%`}
            help={`${currency(dashboard.quarterly.realized_value)} de ${currency(dashboard.quarterly.target_value)}`}
          />
          {dashboard.collective.allowed ? (
            <Metric
              label="Contribuição coletiva"
              value={`${numeric(dashboard.collective.progress_percent)}%`}
              help="Agregado autorizado, sem dados individuais"
            />
          ) : (
            <Metric
              label="Contribuição coletiva"
              value="Indisponível"
              help="O agregado não está autorizado neste período"
            />
          )}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Dias úteis restantes"
            value={numeric(metric(realized, "business_days_remaining"))}
          />
          <Metric
            label="Média por dia útil"
            value={currency(dashboard.average_per_business_day)}
            help="Valor canônico do período"
          />
          <Metric
            label="Necessário por dia útil"
            value={currency(regularGoals[0]?.required_per_business_day)}
          />
          <Metric
            label="Comparação mensal"
            value={`${numeric(dashboard.comparison.delta_percent)}%`}
            help={`${currency(dashboard.comparison.delta_value)} ante o mês anterior`}
          />
        </div>
      </section>
      <section aria-labelledby="tickets">
        <h2 id="tickets" className="text-xl font-semibold">
          Tickets
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Metric
            label="Ticket médio por venda"
            value={currency(dashboard.tickets.sale)}
            help={
              closed
                ? "Média por venda realizada"
                : "Sem vendas realizadas neste período"
            }
          />
          <Metric
            label="Ticket médio por peça"
            value={currency(dashboard.tickets.piece)}
            help={
              pieces
                ? "Média por peça realizada"
                : "Sem peças realizadas neste período"
            }
          />
        </div>
      </section>
      <section aria-labelledby="pipeline">
        <Card>
          <CardHeader>
            <CardTitle id="pipeline">Pipeline · vendas OPEN</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Ainda não entra no realizado
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {currency(dashboard.pipeline.value)}
            </p>
            <p>{numeric(dashboard.pipeline.sales_count)} venda(s)</p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

const SaleForm = ({
  form,
  methods,
  saving,
  error,
  fieldErrors,
  errorRef,
  update,
  submit,
  cancel,
  reload,
}: {
  form: FormState;
  methods: ConsultantPaymentMethod[];
  saving: boolean;
  error: string;
  fieldErrors: FieldErrors;
  errorRef: React.RefObject<HTMLDivElement>;
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  submit: (event: React.FormEvent) => void;
  cancel: () => void;
  reload: () => void;
}) => (
  <Card>
    <CardHeader>
      <CardTitle>
        {form.saleId ? `Editar venda · PV ${form.pvNumber}` : "Nova venda"}
      </CardTitle>
    </CardHeader>
    <CardContent>
      {error && (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive mb-4 rounded-lg border p-3"
        >
          {error}
          {Object.entries(fieldErrors).length > 0 && (
            <ul className="mt-2 list-disc pl-5">
              {Object.entries(fieldErrors).map(([field, message]) => (
                <li key={field}>
                  <a className="underline" href={`#${fieldId(field)}`}>
                    {message}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {error.includes("outro lugar") && (
            <Button variant="link" onClick={() => void reload()}>
              Recarregar estado atual
            </Button>
          )}
        </div>
      )}
      <form className="space-y-6" onSubmit={submit}>
        <fieldset className="grid gap-3">
          <legend className="font-semibold">
            Situação comercial · obrigatório
          </legend>
          {(["OPEN", "CLOSED"] as const).map((status) => (
            <Label
              key={status}
              className="flex min-h-11 items-start gap-3 rounded-lg border p-3"
            >
              <input
                type="radio"
                name="status"
                checked={form.status === status}
                onChange={() => update("status", status)}
              />
              <span>
                <strong>
                  {status === "OPEN" ? "Pipeline · OPEN" : "Realizado · CLOSED"}
                </strong>
                <span className="text-muted-foreground block text-sm">
                  {status === "OPEN"
                    ? "Ainda não entra no realizado."
                    : "Entra no realizado."}
                </span>
              </span>
            </Label>
          ))}
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="PV · obrigatório" id="pv" error={fieldErrors.pvNumber}>
            <Input
              id="pv"
              className="min-h-11"
              value={form.pvNumber}
              onChange={(e) => update("pvNumber", e.target.value)}
              aria-invalid={Boolean(fieldErrors.pvNumber)}
              aria-describedby={fieldErrors.pvNumber ? "pv-error" : undefined}
              required
            />
          </Field>
          <Field
            label="Data e hora · obrigatório"
            id="sold-at"
            error={fieldErrors.soldAt}
          >
            <Input
              id="sold-at"
              type="datetime-local"
              className="min-h-11"
              value={form.soldAt}
              onChange={(e) => update("soldAt", e.target.value)}
              aria-invalid={Boolean(fieldErrors.soldAt)}
              aria-describedby={
                fieldErrors.soldAt ? "sold-at-error" : undefined
              }
              required
            />
          </Field>
          <Field label="NF" id="invoice">
            <Input
              id="invoice"
              className="min-h-11"
              value={form.invoiceNumber}
              onChange={(e) => update("invoiceNumber", e.target.value)}
            />
          </Field>
          <MoneyField
            id="sale-value"
            label="Valor da venda · obrigatório"
            value={form.saleValue}
            set={(v) => update("saleValue", v)}
            error={fieldErrors.saleValue}
          />
          <MoneyField
            id="freight"
            label="Frete · obrigatório"
            value={form.freightValue}
            set={(v) => update("freightValue", v)}
            error={fieldErrors.freightValue}
          />
          <MoneyField
            id="discount"
            label="Desconto · obrigatório"
            value={form.discountValue}
            set={(v) => update("discountValue", v)}
            error={fieldErrors.discountValue}
          />
          <div>
            <Label htmlFor="payment">Forma de pagamento · obrigatório</Label>
            <select
              id="payment"
              className="border-input bg-background mt-1 min-h-11 w-full rounded-md border px-3"
              value={form.paymentMethodId}
              onChange={(e) => update("paymentMethodId", e.target.value)}
              aria-invalid={Boolean(fieldErrors.paymentMethodId)}
              aria-describedby={
                fieldErrors.paymentMethodId ? "payment-error" : undefined
              }
              required
            >
              <option value="">Selecione</option>
              {methods.map((method) => (
                <option key={method.id} value={method.id}>
                  {method.name}
                </option>
              ))}
            </select>
            {fieldErrors.paymentMethodId && (
              <p id="payment-error" className="text-destructive mt-1 text-sm">
                {fieldErrors.paymentMethodId}
              </p>
            )}
          </div>
          <NumberField
            id="installments"
            label="Parcelas · obrigatório"
            min={1}
            value={form.installments}
            set={(v) => update("installments", v)}
            error={fieldErrors.installments}
          />
          <NumberField
            id="sets"
            label="Conjuntos · obrigatório"
            min={0}
            value={form.setsCount}
            set={(v) => update("setsCount", v)}
            error={fieldErrors.setsCount}
          />
          <NumberField
            id="pieces"
            label="Peças avulsas · obrigatório"
            min={0}
            value={form.loosePiecesCount}
            set={(v) => update("loosePiecesCount", v)}
            error={fieldErrors.loosePiecesCount}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="min-h-11" disabled={saving}>
            {saving ? "Salvando venda..." : "Salvar venda"}
          </Button>
          {form.saleId && (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={cancel}
            >
              Cancelar edição
            </Button>
          )}
          <Button
            type="button"
            variant="link"
            className="min-h-11"
            onClick={() =>
              document.getElementById("my-sales")?.scrollIntoView()
            }
          >
            Voltar às minhas vendas
          </Button>
        </div>
      </form>
    </CardContent>
  </Card>
);
const fieldId = (field: string) =>
  ({
    pvNumber: "pv",
    soldAt: "sold-at",
    saleValue: "sale-value",
    freightValue: "freight",
    discountValue: "discount",
    paymentMethodId: "payment",
    installments: "installments",
    setsCount: "sets",
    loosePiecesCount: "pieces",
  })[field] ?? field;
function Field({
  label,
  id,
  children,
  error,
}: {
  label: string;
  id: string;
  children: React.ReactNode;
  error?: string;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-destructive mt-1 text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
function MoneyField({
  id,
  label,
  value,
  set,
  error,
}: {
  id: string;
  label: string;
  value: string;
  set: (value: string) => void;
  error?: string;
}) {
  return (
    <Field id={id} label={label} error={error}>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        className="min-h-11"
        value={value}
        onChange={(e) => set(e.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        required
      />
    </Field>
  );
}
function NumberField({
  id,
  label,
  min,
  value,
  set,
  error,
}: {
  id: string;
  label: string;
  min: number;
  value: string;
  set: (value: string) => void;
  error?: string;
}) {
  return (
    <Field id={id} label={label} error={error}>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        step="1"
        className="min-h-11"
        value={value}
        onChange={(e) => set(e.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        required
      />
    </Field>
  );
}
function SaleStatus({ status }: { status: "OPEN" | "CLOSED" }) {
  return (
    <StatusBadge status={status === "CLOSED" ? "success" : "warning"}>
      {status === "OPEN" ? "Pipeline · OPEN" : "Realizado · CLOSED"}
    </StatusBadge>
  );
}
function SalesListView({
  data,
  edit,
  page,
}: {
  data: ConsultantSalesList | null;
  edit: (sale: ConsultantSale) => void;
  page: (value: number) => void;
}) {
  if (!data?.items.length)
    return (
      <Card id="my-sales">
        <CardContent className="p-6">
          <h2 className="text-xl font-semibold">Minhas vendas</h2>
          <p className="mt-2">Nenhuma venda corresponde aos filtros.</p>
        </CardContent>
      </Card>
    );
  return (
    <section
      id="my-sales"
      aria-labelledby="my-sales-title"
      className="space-y-3"
    >
      <h2 id="my-sales-title" className="text-xl font-semibold">
        Minhas vendas
      </h2>
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="p-3">PV</th>
              <th className="p-3">Data</th>
              <th className="p-3">Valor</th>
              <th className="p-3">Status</th>
              <th className="p-3">Ação</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr key={item.id} className="border-b">
                <td className="p-3">{item.pv_number}</td>
                <td className="p-3">
                  {new Date(item.sold_at).toLocaleDateString("pt-BR")}
                </td>
                <td className="p-3 tabular-nums">
                  {currency(item.sale_value)}
                </td>
                <td className="p-3">
                  <SaleStatus status={item.status} />
                </td>
                <td className="p-3">
                  {item.can_edit ? (
                    <Button
                      variant="outline"
                      className="min-h-11"
                      onClick={() => edit(item)}
                    >
                      Editar
                    </Button>
                  ) : (
                    <span>Somente leitura · período encerrado</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 md:hidden">
        {data.items.map((item) => (
          <Card key={item.id}>
            <CardContent className="space-y-3 p-4">
              <div className="flex justify-between gap-2">
                <strong>PV {item.pv_number}</strong>
                <SaleStatus status={item.status} />
              </div>
              <p className="tabular-nums">
                {currency(item.sale_value)} ·{" "}
                {new Date(item.sold_at).toLocaleDateString("pt-BR")}
              </p>
              {item.can_edit ? (
                <Button
                  variant="outline"
                  className="min-h-11 w-full"
                  onClick={() => edit(item)}
                >
                  Editar
                </Button>
              ) : (
                <p>Somente leitura · período encerrado</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <nav
        aria-label={`Página ${data.page}`}
        className="flex items-center justify-between gap-3"
      >
        <Button
          variant="outline"
          disabled={data.page <= 1}
          onClick={() => page(data.page - 1)}
        >
          Anterior
        </Button>
        <span>
          Página {data.page} · {data.total} vendas
        </span>
        <Button
          variant="outline"
          disabled={data.page * data.page_size >= Number(data.total)}
          onClick={() => page(data.page + 1)}
        >
          Próxima
        </Button>
      </nav>
    </section>
  );
}

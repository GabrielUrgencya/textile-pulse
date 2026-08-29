"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Switch } from "@/components/ui/switch";
import { salesAdminConfigurationRequest } from "@/components/sales/admin/SalesAdminConfiguration";
import { SalesGoalsCard } from "@/components/sales/admin/SalesGoalsCard";
import { SalesHolidayCalendar } from "@/components/sales/admin/SalesHolidayCalendar";
import { SalesLoading } from "@/components/sales/SalesLoading";
import type { SalesAdminConfiguration, SalesGoalRecord, SalesHolidayRecord, SalesPeriodRecord } from "@/lib/sales-admin-configuration";

type Kind = "calendar" | "periods" | "goals";
const titles = { calendar: ["Calendário comercial", "Feriados ajustam os dias úteis canônicos; histórico encerrado é protegido."], periods: ["Períodos comerciais", "Configure períodos abertos sem sobreposição. Encerrados são somente leitura."], goals: ["Metas, atribuições e comissões", "Valores e comissões vigentes alimentam a fonte canônica sem fórmulas no navegador."] } as const;

export function SalesAdminPlanning({ kind }: { kind: Kind }) {
  const [data, setData] = useState<SalesAdminConfiguration | null>(null); const [error, setError] = useState<string | null>(null); const [editing, setEditing] = useState<unknown>(null); const [announcement, setAnnouncement] = useState("");
  const load = useCallback(async () => { setError(null); try { setData(await salesAdminConfigurationRequest("/api/vendas/admin/configuration")); } catch (cause) { setError(cause instanceof Error ? cause.message : "Dados indisponíveis."); } }, []);
  useEffect(() => void load(), [load]);
  return <div className="space-y-6"><PageHeader eyebrow="LISION Vendas" title={titles[kind][0]} description={titles[kind][1]} /><div aria-live="polite" className="sr-only">{announcement}</div>{error && <div role="alert" className="rounded-lg border border-destructive/30 p-3 text-destructive">{error} <Button variant="link" onClick={() => void load()}>Tentar novamente</Button></div>}{!data ? <SalesLoading variant={kind === "calendar" ? "cards" : "list"} /> : <>{kind === "calendar" && <Calendar data={data} editing={editing as SalesHolidayRecord | "new" | null} setEditing={setEditing} reload={load} announce={setAnnouncement} />}{kind === "periods" && <Periods data={data} editing={editing as SalesPeriodRecord | "new" | null} setEditing={setEditing} reload={load} announce={setAnnouncement} />}{kind === "goals" && <Goals data={data} editing={editing as SalesGoalRecord | "new" | null} setEditing={setEditing} reload={load} announce={setAnnouncement} />}</>}</div>;
}

type Shared<T> = { data: SalesAdminConfiguration; editing: T | "new" | null; setEditing: (value: unknown) => void; reload: () => Promise<void>; announce: (value: string) => void };
function easterSunday(year: number) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}
function brNationalHolidays(year: number): Array<{ date: string; name: string }> {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const easter = easterSunday(year); const shift = (days: number) => { const d = new Date(easter); d.setUTCDate(d.getUTCDate() + days); return iso(d); };
  return [
    { date: `${year}-01-01`, name: "Confraternização Universal" },
    { date: shift(-48), name: "Carnaval (segunda)" },
    { date: shift(-47), name: "Carnaval (terça)" },
    { date: shift(-2), name: "Sexta-feira Santa" },
    { date: `${year}-04-21`, name: "Tiradentes" },
    { date: `${year}-05-01`, name: "Dia do Trabalho" },
    { date: shift(60), name: "Corpus Christi" },
    { date: `${year}-09-07`, name: "Independência do Brasil" },
    { date: `${year}-10-12`, name: "Nossa Senhora Aparecida" },
    { date: `${year}-11-02`, name: "Finados" },
    { date: `${year}-11-15`, name: "Proclamação da República" },
    { date: `${year}-11-20`, name: "Consciência Negra" },
    { date: `${year}-12-25`, name: "Natal" },
  ];
}
function Calendar(props: Shared<SalesHolidayRecord>) {
  const [prefill, setPrefill] = useState("");
  const [importing, setImporting] = useState(false);
  const week = props.data.config?.weekStartsOn ?? 0;
  const importYear = new Date().getFullYear();
  async function importNational() {
    if (importing) return; setImporting(true);
    const existing = new Set(props.data.holidays.map((h) => h.date));
    let added = 0;
    try {
      for (const h of brNationalHolidays(importYear)) {
        if (existing.has(h.date)) continue;
        try { await salesAdminConfigurationRequest("/api/vendas/admin/holidays", { method: "PUT", body: JSON.stringify({ holidayId: null, date: h.date, name: h.name, isActive: true, expectedRevision: 0 }) }); added++; }
        catch { /* duplicado/erro pontual — segue */ }
      }
      props.announce(`${added} feriado(s) nacional(is) importado(s) para ${importYear}.`);
      await props.reload();
    } finally { setImporting(false); }
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Clique num dia do calendário para cadastrar um feriado — ou use os botões.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="min-h-11" disabled={importing} onClick={() => void importNational()}>{importing ? "Importando..." : `Importar feriados BR ${importYear}`}</Button>
          <Button className="min-h-11" onClick={() => { setPrefill(""); props.setEditing("new"); }}>Adicionar feriado</Button>
        </div>
      </div>
      <SalesHolidayCalendar
        holidays={props.data.holidays}
        weekStartsOn={week}
        onPickDate={(d) => { const existing = props.data.holidays.find((h) => h.date === d); if (existing) { props.setEditing(existing); } else { setPrefill(d); props.setEditing("new"); } }}
      />
      {props.editing && <HolidayForm {...props} item={props.editing} initialDate={prefill} />}
      {props.data.holidays.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium uppercase tracking-[0.12em] text-muted-foreground">Feriados cadastrados</h3>
          {props.data.holidays.map((item) => <Row key={item.id} title={item.name} detail={`${item.date} · ${item.isActive ? "Ativo" : "Inativo"}`} action={<Button variant="outline" className="min-h-11" onClick={() => props.setEditing(item)}>Editar</Button>} />)}
        </div>
      )}
    </div>
  );
}
function HolidayForm({ item, setEditing, reload, announce, initialDate }: Shared<SalesHolidayRecord> & { item: SalesHolidayRecord | "new"; initialDate?: string }) { const base = item === "new" ? null : item; const [date, setDate] = useState(base?.date ?? initialDate ?? ""); const [name, setName] = useState(base?.name ?? ""); const [active, setActive] = useState(base?.isActive ?? true); return <Editor title={base ? "Editar feriado" : "Novo feriado"} endpoint="/api/vendas/admin/holidays" body={{ holidayId: base?.id ?? null, date, name, isActive: active, expectedRevision: base?.revision ?? 0 }} close={() => setEditing(null)} reload={reload} announce={() => announce("Feriado salvo.")}><Field label="Data" id="holiday-date"><Input id="holiday-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="min-h-11" /></Field><Field label="Nome" id="holiday-name"><Input id="holiday-name" value={name} onChange={(e) => setName(e.target.value)} className="min-h-11" /></Field><Toggle id="holiday-active" label="Feriado ativo" value={active} setValue={setActive} /></Editor>; }

function businessDaysRemaining(endsOn: string, holidays: Set<string>) {
  const end = new Date(`${endsOn}T00:00:00`); const today = new Date(); today.setHours(0, 0, 0, 0);
  if (end < today) return 0;
  let count = 0; const cursor = new Date(today);
  while (cursor <= end) { const wd = cursor.getDay(); const iso = cursor.toISOString().slice(0, 10); if (wd !== 0 && wd !== 6 && !holidays.has(iso)) count++; cursor.setDate(cursor.getDate() + 1); }
  return count;
}
function Periods(props: Shared<SalesPeriodRecord>) {
  const holidays = new Set(props.data.holidays.filter((h) => h.isActive).map((h) => h.date));
  return (
    <div className="space-y-4">
      <Button className="min-h-11" onClick={() => props.setEditing("new")}>Novo período</Button>
      {props.editing && <PeriodForm {...props} item={props.editing} />}
      {props.data.periods.length === 0 ? <Empty text="Nenhum período configurado." /> : props.data.periods.map((item) => (
        <Card key={item.id}>
          <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{item.startsOn} a {item.endsOn}</p>
                <StatusBadge status={item.status === "OPEN" ? "success" : "neutral"}>{item.status === "OPEN" ? "Aberto" : "Encerrado"}</StatusBadge>
              </div>
              <p className="text-sm text-muted-foreground">{item.status === "OPEN" ? `${businessDaysRemaining(item.endsOn, holidays)} dia(s) útil(eis) até o fim do período` : "Histórico · somente leitura"}</p>
            </div>
            {item.status === "OPEN" && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="min-h-11" onClick={() => props.setEditing(item)}>Editar datas</Button>
                <Button asChild variant="outline" className="min-h-11"><Link href="/vendas/admin/fechamento">Revisar fechamento</Link></Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
function PeriodForm({ item, setEditing, reload, announce }: Shared<SalesPeriodRecord> & { item: SalesPeriodRecord | "new" }) { const base = item === "new" ? null : item; const [startsOn, setStart] = useState(base?.startsOn ?? ""); const [endsOn, setEnd] = useState(base?.endsOn ?? ""); return <Editor title={base ? "Editar período aberto" : "Novo período"} endpoint="/api/vendas/admin/periods" body={{ periodId: base?.id ?? null, startsOn, endsOn, expectedRevision: base?.revision ?? 0 }} close={() => setEditing(null)} reload={reload} announce={() => announce("Período salvo.")}><Field label="Início" id="period-start"><Input id="period-start" type="date" value={startsOn} onChange={(e) => setStart(e.target.value)} className="min-h-11" /></Field><Field label="Fim" id="period-end"><Input id="period-end" type="date" value={endsOn} onChange={(e) => setEnd(e.target.value)} className="min-h-11" /></Field></Editor>; }

function Goals(props: Shared<SalesGoalRecord>) { return <div className="space-y-6">{props.data.goals.length === 0 && <GoalsInitCard reload={props.reload} announce={props.announce} />}<SalesGoalsCard goals={props.data.goals} reload={props.reload} announce={props.announce} /><GoalSimulator goals={props.data.goals} /></div>; }

/**
 * Inicialização self-service das metas padrão. Aparece só quando o tenant ainda
 * não tem metas — chama a RPC idempotente e recarrega, revelando as 6 metas
 * canônicas prontas para edição. Substitui o script de provisionamento.
 */
function GoalsInitCard({ reload, announce }: { reload: () => Promise<void>; announce: (value: string) => void }) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    if (running) return; setRunning(true); setError(null);
    try {
      const result = await salesAdminConfigurationRequest<{ goalsCreated: number; assignmentsCreated: number; periodCreated: boolean }>(
        "/api/vendas/admin/provision-defaults", { method: "POST" },
      );
      announce(`Metas inicializadas: ${result.goalsCreated} meta(s)${result.periodCreated ? " + período do mês" : ""}.`);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível inicializar as metas.");
    } finally { setRunning(false); }
  }
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div>
          <h3 className="font-semibold">Comece por aqui — inicialize as metas padrão</h3>
          <p className="text-sm text-muted-foreground">
            Cria as 6 metas do modelo (Meta 1/2/3, Desafio, Trimestral, Coletiva) com valores
            de exemplo, um período aberto para o mês corrente e os métodos de pagamento padrão —
            tudo editável depois. Pode rodar de novo sem risco: só preenche o que faltar.
          </p>
        </div>
        {error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        <Button className="min-h-11" disabled={running} onClick={() => void run()}>
          {running ? "Inicializando..." : "Inicializar metas padrão"}
        </Button>
      </CardContent>
    </Card>
  );
}

export function GoalSimulator({ goals }: { goals: SalesGoalRecord[] }) {
  const money = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
  const tiers = [...goals].filter((g) => g.isActive && g.scope === "INDIVIDUAL" && g.commissionPercent > 0).sort((a, b) => a.targetValue - b.targetValue);
  const [value, setValue] = useState(0);
  const reached = [...tiers].reverse().find((t) => value >= t.targetValue) ?? null;
  const commission = reached ? value * (reached.commissionPercent / 100) : 0;
  if (tiers.length === 0) return null;
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div>
          <h3 className="font-semibold">Simulador de comissão</h3>
          <p className="text-sm text-muted-foreground">Informe o realizado da consultora no período e veja qual meta bate e a comissão.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="space-y-1"><Label htmlFor="sim-value">Realizado (R$)</Label><Input id="sim-value" type="number" min={0} step="0.01" value={value} onChange={(e) => setValue(Number(e.target.value))} className="min-h-11 sm:w-56" /></div>
          <div className="rounded-lg border border-border/60 bg-secondary/30 px-4 py-2">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Comissão estimada</p>
            <p className="text-xl font-semibold tabular-nums">{money(commission)} <span className="text-sm font-normal text-muted-foreground">{reached ? `· ${reached.name} (${reached.commissionPercent}%)` : "· nenhuma meta batida"}</span></p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {tiers.map((t) => { const ok = value >= t.targetValue; return (
            <div key={t.id} className={`rounded-lg border p-3 ${ok ? "border-success/40 bg-success/10" : "border-border/40"}`}>
              <p className="text-sm font-medium">{t.name}</p>
              <p className="text-[11px] text-muted-foreground">meta {money(t.targetValue)} · {t.commissionPercent}%</p>
              <p className={`mt-1 text-[11px] ${ok ? "text-success" : "text-muted-foreground/60"}`}>{ok ? "batida" : `faltam ${money(Math.max(0, t.targetValue - value))}`}</p>
            </div>
          ); })}
        </div>
      </CardContent>
    </Card>
  );
}

function Editor({ title, endpoint, body, close, reload, announce, children }: { title: string; endpoint: string; body: unknown; close: () => void; reload: () => Promise<void>; announce: () => void; children: React.ReactNode }) { const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null); const ref = useRef<HTMLDivElement>(null); async function save(event: React.FormEvent) { event.preventDefault(); setSaving(true); setError(null); try { await salesAdminConfigurationRequest(endpoint, { method: "PUT", body: JSON.stringify(body) }); announce(); close(); await reload(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao salvar."); requestAnimationFrame(() => ref.current?.focus()); } finally { setSaving(false); } } return <Card><CardContent className="p-5"><form className="grid gap-4 md:grid-cols-2" onSubmit={(e) => void save(e)}><h2 className="text-lg font-semibold md:col-span-2">{title}</h2>{error && <div ref={ref} tabIndex={-1} role="alert" className="rounded border border-destructive/30 p-3 text-destructive md:col-span-2">{error}</div>}{children}<div className="flex gap-2 md:col-span-2 md:justify-end"><Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={close}>Cancelar</Button><Button type="submit" className="min-h-11" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button></div></form></CardContent></Card>; }
function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) { return <div className="space-y-2"><Label htmlFor={id}>{label}</Label>{children}</div>; }
function Toggle({ id, label, value, setValue }: { id: string; label: string; value: boolean; setValue: (value: boolean) => void }) { return <div className="flex min-h-11 items-center gap-3"><Switch id={id} checked={value} onCheckedChange={setValue} /><Label htmlFor={id}>{label}</Label></div>; }
function Empty({ text }: { text: string }) { return <Card><CardContent className="p-5 text-muted-foreground">{text}</CardContent></Card>; }
function Row({ title, detail, action }: { title: string; detail: string; action: React.ReactNode }) { return <Card><CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"><div><p className="font-medium">{title}</p><p className="text-sm text-muted-foreground">{detail}</p></div>{action}</CardContent></Card>; }

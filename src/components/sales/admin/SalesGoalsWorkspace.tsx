"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { salesAdminConfigurationRequest } from "./SalesAdminConfiguration";
import { GoalSimulator } from "./SalesAdminPlanning";
import type { SalesAdminConfiguration, SalesGoalRecord, SalesGoalAssignmentRecord, SalesPeriodRecord } from "@/lib/sales-admin-configuration";
import type { SalesAdminDirectoryEntry } from "@/lib/sales-admin";

type ApiError = { error?: { code?: string; message?: string } };
const brl = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const parseNum = (v: string): number | null => { const t = v.trim().replace(/\./g, "").replace(",", "."); if (!t) return null; const n = Number(t); return Number.isFinite(n) && n >= 0 ? n : NaN; };

export function SalesGoalsWorkspace() {
  const [data, setData] = useState<SalesAdminConfiguration | null>(null);
  const [consultants, setConsultants] = useState<SalesAdminDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [cfg, dir] = await Promise.all([
        salesAdminConfigurationRequest<SalesAdminConfiguration>("/api/vendas/admin/configuration"),
        fetch("/api/vendas/admin/directory", { cache: "no-store" }).then((r) => r.json() as Promise<{ data?: SalesAdminDirectoryEntry[] } & ApiError>),
      ]);
      setData(cfg);
      setConsultants((dir.data ?? []).filter((p) => p.salesRole === "CONSULTANT" && p.membershipIsActive));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar as metas.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => void load(), [load]);

  const openPeriod = useMemo<SalesPeriodRecord | null>(() => data?.periods.find((p) => p.status === "OPEN") ?? null, [data]);
  const generalGoals = useMemo(() => (data?.goals ?? []).filter((g) => g.scope !== "INDIVIDUAL").sort((a, b) => a.sortOrder - b.sortOrder), [data]);
  const individualGoals = useMemo(() => (data?.goals ?? []).filter((g) => g.scope === "INDIVIDUAL").sort((a, b) => a.sortOrder - b.sortOrder), [data]);

  if (loading && !data) return <div className="p-6 text-sm text-muted-foreground">Carregando metas...</div>;

  return (
    <div className="space-y-8">
      <div aria-live="polite" className="sr-only">{announce}</div>
      <PageHeader eyebrow="Administração comercial" title="Metas & Comissões" description="Configure a meta geral e a meta individual de cada consultora. Os números individuais prevalecem sobre a base da meta." />
      {error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error} <Button variant="link" onClick={() => void load()}>Tentar novamente</Button></div>}

      {data && data.goals.length === 0 && <InitCard onDone={load} announce={setAnnounce} />}

      {data && (
        <>
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Metas gerais (coletiva & trimestral)</h2>
            </div>
            {generalGoals.length === 0 ? (
              <Card><CardContent className="p-4 text-sm text-muted-foreground">Nenhuma meta geral. Crie uma abaixo ou inicialize as metas padrão.</CardContent></Card>
            ) : generalGoals.map((goal) => <GeneralGoalRow key={goal.id} goal={goal} onChanged={load} announce={setAnnounce} />)}
            <NewGoalForm scope="COLLECTIVE" nextSort={(generalGoals.at(-1)?.sortOrder ?? 0) + 1} onChanged={load} announce={setAnnounce} />
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Metas individuais por consultora</h2>
            <p className="text-sm text-muted-foreground">Cada meta tem um valor-base; ajuste o número de cada consultora (em branco = herda a base). {!openPeriod && "Abra um período para atribuir."}</p>
            {individualGoals.length === 0 ? (
              <Card><CardContent className="p-4 text-sm text-muted-foreground">Nenhuma meta individual. Crie uma abaixo.</CardContent></Card>
            ) : individualGoals.map((goal) => (
              <IndividualGoalCard key={goal.id} goal={goal} period={openPeriod} consultants={consultants} assignments={data.assignments} onChanged={load} announce={setAnnounce} />
            ))}
            <NewGoalForm scope="INDIVIDUAL" nextSort={(individualGoals.at(-1)?.sortOrder ?? 0) + 1} onChanged={load} announce={setAnnounce} />
          </section>

          <GoalSimulator goals={data.goals} />
        </>
      )}
    </div>
  );
}

function InitCard({ onDone, announce }: { onDone: () => Promise<void>; announce: (v: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    setBusy(true); setError(null);
    try {
      const r = await salesAdminConfigurationRequest<{ goalsCreated: number }>("/api/vendas/admin/provision-defaults", { method: "POST" });
      announce(`Metas inicializadas (${r.goalsCreated}).`);
      await onDone();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao inicializar."); }
    finally { setBusy(false); }
  }
  return (
    <Card><CardContent className="space-y-3 p-5">
      <div><h3 className="font-semibold">Comece por aqui</h3><p className="text-sm text-muted-foreground">Cria as 6 metas padrão + período do mês + métodos. Tudo editável depois.</p></div>
      {error && <div role="alert" className="text-sm text-destructive">{error}</div>}
      <Button className="min-h-11" disabled={busy} onClick={() => void run()}>{busy ? "Inicializando..." : "Inicializar metas padrão"}</Button>
    </CardContent></Card>
  );
}

/** Edição de uma meta geral (coletiva/trimestral): nome, valor-base, comissão + excluir. */
function GeneralGoalRow({ goal, onChanged, announce }: { goal: SalesGoalRecord; onChanged: () => Promise<void>; announce: (v: string) => void }) {
  const [name, setName] = useState(goal.name);
  const [target, setTarget] = useState(String(goal.targetValue));
  const [commission, setCommission] = useState(String(goal.commissionPercent));
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scopeLabel = goal.scope === "QUARTERLY" ? "Trimestral" : "Coletiva";

  async function save() {
    const t = parseNum(target); const c = parseNum(commission);
    if (t === null || Number.isNaN(t) || c === null || Number.isNaN(c) || c > 100) { setError("Valores inválidos."); return; }
    setBusy(true); setError(null);
    try {
      await salesAdminConfigurationRequest(`/api/vendas/admin/goals`, { method: "PUT", body: JSON.stringify({ goalId: goal.id, provisioningKey: goal.provisioningKey, name: name.trim(), scope: goal.scope, targetValue: t, commissionPercent: c, sortOrder: goal.sortOrder, isChallenge: goal.isChallenge, isActive: goal.isActive, validFrom: goal.validFrom, validUntil: goal.validUntil, expectedRevision: goal.revision }) });
      announce(`Meta "${name.trim()}" salva.`); await onChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao salvar."); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError(null);
    try { await salesAdminConfigurationRequest(`/api/vendas/admin/goals/${goal.id}`, { method: "DELETE" }); announce(`Meta "${goal.name}" excluída.`); await onChanged(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao excluir."); setConfirming(false); setBusy(false); }
  }
  return (
    <Card><CardContent className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2"><StatusBadge status="neutral">{scopeLabel}</StatusBadge>{goal.provisioningKey && <span className="text-xs text-muted-foreground">{goal.provisioningKey}</span>}</div>
      <div className="grid gap-3 sm:grid-cols-[1fr_160px_120px_auto] sm:items-end">
        <div className="space-y-1"><Label htmlFor={`gn-${goal.id}`}>Nome</Label><Input id={`gn-${goal.id}`} className="min-h-11" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor={`gt-${goal.id}`}>Valor (R$)</Label><Input id={`gt-${goal.id}`} inputMode="decimal" className="min-h-11" value={target} onChange={(e) => setTarget(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor={`gc-${goal.id}`}>Comissão %</Label><Input id={`gc-${goal.id}`} inputMode="decimal" className="min-h-11" value={commission} onChange={(e) => setCommission(e.target.value)} /></div>
        <div className="flex gap-1">
          {confirming ? (
            <><Button variant="destructive" className="min-h-11" disabled={busy} onClick={() => void remove()}>Excluir</Button><Button variant="outline" className="min-h-11" disabled={busy} onClick={() => setConfirming(false)}>Cancelar</Button></>
          ) : (
            <><Button className="min-h-11" disabled={busy} onClick={() => void save()}>{busy ? "..." : "Salvar"}</Button><Button variant="ghost" className="min-h-11 text-destructive hover:text-destructive" disabled={busy} onClick={() => { setConfirming(true); setError(null); }}>Excluir</Button></>
          )}
        </div>
      </div>
      {error && <div role="alert" className="rounded border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">{error}</div>}
    </CardContent></Card>
  );
}

/** Meta individual: valor-base editável + tabela de consultoras com número próprio (override). */
function IndividualGoalCard({ goal, period, consultants, assignments, onChanged, announce }: {
  goal: SalesGoalRecord; period: SalesPeriodRecord | null; consultants: SalesAdminDirectoryEntry[]; assignments: SalesGoalAssignmentRecord[]; onChanged: () => Promise<void>; announce: (v: string) => void;
}) {
  const [name, setName] = useState(goal.name);
  const [base, setBase] = useState(String(goal.targetValue));
  const [commission, setCommission] = useState(String(goal.commissionPercent));
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveGoal() {
    const t = parseNum(base); const c = parseNum(commission);
    if (t === null || Number.isNaN(t) || c === null || Number.isNaN(c) || c > 100) { setError("Valores inválidos."); return; }
    setBusy(true); setError(null);
    try {
      await salesAdminConfigurationRequest(`/api/vendas/admin/goals`, { method: "PUT", body: JSON.stringify({ goalId: goal.id, provisioningKey: goal.provisioningKey, name: name.trim(), scope: "INDIVIDUAL", targetValue: t, commissionPercent: c, sortOrder: goal.sortOrder, isChallenge: goal.isChallenge, isActive: goal.isActive, validFrom: goal.validFrom, validUntil: goal.validUntil, expectedRevision: goal.revision }) });
      announce(`Meta "${name.trim()}" salva.`); await onChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao salvar."); }
    finally { setBusy(false); }
  }
  async function removeGoal() {
    setBusy(true); setError(null);
    try { await salesAdminConfigurationRequest(`/api/vendas/admin/goals/${goal.id}`, { method: "DELETE" }); announce(`Meta "${goal.name}" excluída.`); await onChanged(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao excluir."); setConfirming(false); setBusy(false); }
  }

  return (
    <Card><CardContent className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status="neutral">Individual</StatusBadge>{goal.isChallenge && <StatusBadge status="warning">Desafio</StatusBadge>}{goal.provisioningKey && <span className="text-xs text-muted-foreground">{goal.provisioningKey}</span>}
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_160px_120px_auto] sm:items-end">
        <div className="space-y-1"><Label htmlFor={`in-${goal.id}`}>Nome</Label><Input id={`in-${goal.id}`} className="min-h-11" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor={`ib-${goal.id}`}>Valor-base (R$)</Label><Input id={`ib-${goal.id}`} inputMode="decimal" className="min-h-11" value={base} onChange={(e) => setBase(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor={`ic-${goal.id}`}>Comissão %</Label><Input id={`ic-${goal.id}`} inputMode="decimal" className="min-h-11" value={commission} onChange={(e) => setCommission(e.target.value)} /></div>
        <div className="flex gap-1">
          {confirming ? (
            <><Button variant="destructive" className="min-h-11" disabled={busy} onClick={() => void removeGoal()}>Excluir</Button><Button variant="outline" className="min-h-11" disabled={busy} onClick={() => setConfirming(false)}>Cancelar</Button></>
          ) : (
            <><Button className="min-h-11" disabled={busy} onClick={() => void saveGoal()}>{busy ? "..." : "Salvar base"}</Button><Button variant="ghost" className="min-h-11 text-destructive hover:text-destructive" disabled={busy} onClick={() => { setConfirming(true); setError(null); }}>Excluir</Button></>
          )}
        </div>
      </div>
      {error && <div role="alert" className="rounded border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">{error}</div>}

      {period && (
        <div className="rounded-lg border border-border/60">
          <div className="border-b border-border/60 px-3 py-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Número por consultora — período {period.startsOn} a {period.endsOn}</div>
          <div className="divide-y divide-border/60">
            {consultants.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nenhuma consultora ativa.</p>}
            {consultants.map((c) => (
              <ConsultantGoalRow key={c.profileId} goal={goal} period={period} consultant={c}
                assignment={assignments.find((a) => a.goalId === goal.id && a.periodId === period.id && a.profileId === c.profileId) ?? null}
                baseTarget={goal.targetValue} baseCommission={goal.commissionPercent} onChanged={onChanged} announce={announce} />
            ))}
          </div>
        </div>
      )}
    </CardContent></Card>
  );
}

/** Uma consultora × uma meta: número próprio editável (override) + atribuir/remover. */
function ConsultantGoalRow({ goal, period, consultant, assignment, baseTarget, baseCommission, onChanged, announce }: {
  goal: SalesGoalRecord; period: SalesPeriodRecord; consultant: SalesAdminDirectoryEntry; assignment: SalesGoalAssignmentRecord | null;
  baseTarget: number; baseCommission: number; onChanged: () => Promise<void>; announce: (v: string) => void;
}) {
  const assigned = assignment !== null && assignment.isActive;
  const [target, setTarget] = useState(assignment?.targetOverride != null ? String(assignment.targetOverride) : "");
  const [commission, setCommission] = useState(assignment?.commissionOverride != null ? String(assignment.commissionOverride) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = consultant.fullName?.trim() || consultant.email || "Consultora";

  async function persist(active: boolean) {
    const to = target.trim() ? parseNum(target) : null;
    const co = commission.trim() ? parseNum(commission) : null;
    if (to !== null && Number.isNaN(to)) { setError("Valor inválido."); return; }
    if (co !== null && (Number.isNaN(co) || co > 100)) { setError("Comissão inválida."); return; }
    setBusy(true); setError(null);
    try {
      await salesAdminConfigurationRequest("/api/vendas/admin/goal-assignments", { method: "PUT", body: JSON.stringify({
        assignmentId: assignment?.id ?? null, goalId: goal.id, periodId: period.id, profileId: consultant.profileId,
        isActive: active, targetOverride: to, commissionOverride: co, expectedRevision: assignment?.revision ?? 0,
      }) });
      announce(`${name}: meta atualizada.`); await onChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao salvar."); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!assignment) return;
    setBusy(true); setError(null);
    try { await salesAdminConfigurationRequest(`/api/vendas/admin/goal-assignments/${assignment.id}`, { method: "DELETE" }); announce(`${name}: meta removida.`); await onChanged(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao remover."); setBusy(false); }
  }

  return (
    <div className="space-y-2 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[140px] flex-1">
          <p className="text-sm font-medium">{name}</p>
          {assigned ? <StatusBadge status="success" size="sm">Atribuída</StatusBadge> : <span className="text-xs text-muted-foreground">Não atribuída</span>}
        </div>
        <div className="space-y-1"><Label htmlFor={`ct-${goal.id}-${consultant.profileId}`} className="text-xs">Meta (R$)</Label><Input id={`ct-${goal.id}-${consultant.profileId}`} inputMode="decimal" className="h-10 w-32" placeholder={`base ${brl(baseTarget)}`} value={target} onChange={(e) => setTarget(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor={`cc-${goal.id}-${consultant.profileId}`} className="text-xs">Comissão %</Label><Input id={`cc-${goal.id}-${consultant.profileId}`} inputMode="decimal" className="h-10 w-24" placeholder={`base ${baseCommission}`} value={commission} onChange={(e) => setCommission(e.target.value)} /></div>
        <div className="flex gap-1">
          <Button className="h-10" disabled={busy} onClick={() => void persist(true)}>{busy ? "..." : assigned ? "Salvar" : "Atribuir"}</Button>
          {assigned && <Button variant="ghost" className="h-10 text-destructive hover:text-destructive" disabled={busy} onClick={() => void remove()}>Remover</Button>}
        </div>
      </div>
      {error && <div role="alert" className="text-xs text-destructive">{error}</div>}
    </div>
  );
}

/** Criar nova meta (geral coletiva ou individual). */
function NewGoalForm({ scope, nextSort, onChanged, announce }: { scope: "COLLECTIVE" | "INDIVIDUAL"; nextSort: number; onChanged: () => Promise<void>; announce: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [commission, setCommission] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    const t = parseNum(target); const c = parseNum(commission);
    if (!name.trim() || t === null || Number.isNaN(t) || c === null || Number.isNaN(c) || c > 100) { setError("Preencha nome, valor e comissão válidos."); return; }
    setBusy(true); setError(null);
    try {
      await salesAdminConfigurationRequest("/api/vendas/admin/goals", { method: "PUT", body: JSON.stringify({ goalId: null, provisioningKey: null, name: name.trim(), scope, targetValue: t, commissionPercent: c, sortOrder: nextSort, isChallenge: false, isActive: true, validFrom: null, validUntil: null, expectedRevision: 0 }) });
      announce(`Meta "${name.trim()}" criada.`); setOpen(false); setName(""); setTarget(""); setCommission("0"); await onChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao criar meta."); }
    finally { setBusy(false); }
  }

  if (!open) return <Button variant="outline" className="min-h-11" onClick={() => { setError(null); setOpen(true); }}>+ Nova meta {scope === "COLLECTIVE" ? "geral" : "individual"}</Button>;
  return (
    <Card><CardContent className="space-y-3 p-4">
      <p className="text-sm font-medium">Nova meta {scope === "COLLECTIVE" ? "geral (coletiva)" : "individual"}</p>
      <div className="grid gap-3 sm:grid-cols-[1fr_160px_120px]">
        <div className="space-y-1"><Label htmlFor={`nn-${scope}`}>Nome</Label><Input id={`nn-${scope}`} className="min-h-11" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Meta 4" /></div>
        <div className="space-y-1"><Label htmlFor={`nt-${scope}`}>Valor (R$)</Label><Input id={`nt-${scope}`} inputMode="decimal" className="min-h-11" value={target} onChange={(e) => setTarget(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor={`nc-${scope}`}>Comissão %</Label><Input id={`nc-${scope}`} inputMode="decimal" className="min-h-11" value={commission} onChange={(e) => setCommission(e.target.value)} /></div>
      </div>
      {error && <div role="alert" className="rounded border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">{error}</div>}
      <div className="flex gap-2"><Button className="min-h-11" disabled={busy} onClick={() => void create()}>{busy ? "Criando..." : "Criar meta"}</Button><Button variant="outline" className="min-h-11" disabled={busy} onClick={() => setOpen(false)}>Cancelar</Button></div>
    </CardContent></Card>
  );
}

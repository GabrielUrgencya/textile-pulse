"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, CreditCard, Pencil, Plus } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { salesAdminConfigurationRequest } from "@/components/sales/admin/SalesAdminConfiguration";
import type {
  SalesAdminPaymentMethod,
  SalesAdminPaymentMethodOrder,
  SalesAdminPaymentMethods,
} from "@/lib/sales-admin";
import type { SalesAdminConfiguration } from "@/lib/sales-admin-configuration";
import type { SalesList } from "@/lib/sales-admin-sales";

type ApiError = {
  error?: {
    code?: string;
    message?: string;
    details?: SalesAdminPaymentMethodOrder;
  };
};

function move<T>(items: T[], from: number, to: number) {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function SalesAdminPaymentMethodsManager() {
  const [methods, setMethods] = useState<SalesAdminPaymentMethod[]>([]);
  const [orderRevision, setOrderRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<SalesAdminPaymentMethod | "new" | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingToggle, setPendingToggle] = useState<SalesAdminPaymentMethod | null>(null);
  const [reordering, setReordering] = useState(false);
  const [draftOrder, setDraftOrder] = useState<SalesAdminPaymentMethod[]>([]);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const reorderIdempotencyKeyRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/vendas/admin/payment-methods", { cache: "no-store" });
      const payload = (await response.json()) as { data?: SalesAdminPaymentMethods } & ApiError;
      if (!response.ok || !payload.data) throw new Error(payload.error?.message || "Não foi possível carregar os métodos.");
      setMethods(payload.data.methods);
      setOrderRevision(payload.data.orderRevision);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os métodos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void load(), [load]);

  // Uso por método no período aberto (PAY-2) — derivado das vendas CLOSED.
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [usageTotal, setUsageTotal] = useState(0);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const config = await salesAdminConfigurationRequest<SalesAdminConfiguration>("/api/vendas/admin/configuration");
        const open = config.periods.find((p) => p.status === "OPEN");
        if (!open) return;
        const counts: Record<string, number> = {}; let total = 0;
        for (let page = 1; page <= 20; page++) {
          const qs = new URLSearchParams({ period: open.id, status: "CLOSED", page: String(page) });
          const res = await salesAdminConfigurationRequest<SalesList>(`/api/vendas/admin/sales?${qs}`);
          for (const it of res.items) { const id = it.payment_method_id ?? "__none__"; counts[id] = (counts[id] ?? 0) + 1; total++; }
          if (res.items.length < res.page_size || total >= Number(res.total)) break;
        }
        if (!cancelled) { setUsage(counts); setUsageTotal(total); }
      } catch { /* uso é enriquecimento opcional; silenciar */ }
    })();
    return () => { cancelled = true; };
  }, []);

  function openEditor(method: SalesAdminPaymentMethod | "new") {
    setEditing(method);
    setName(method === "new" ? "" : method.name);
    setFormError(null);
  }

  async function persistMethod(
    method: SalesAdminPaymentMethod | "new",
    isActive: boolean,
    requestedName = name,
  ) {
    if (saving) return;
    const trimmedName = requestedName.trim();
    if (!trimmedName) {
      setFormError("Informe o nome do método de pagamento.");
      requestAnimationFrame(() => nameRef.current?.focus());
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const response = await fetch("/api/vendas/admin/payment-methods", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          methodId: method === "new" ? null : method.id,
          name: trimmedName,
          isActive,
        }),
      });
      const payload = (await response.json()) as { data?: SalesAdminPaymentMethod } & ApiError;
      if (!response.ok) throw new Error(payload.error?.message || "Não foi possível salvar o método.");
      await load();
      setEditing(null);
      setPendingToggle(null);
      setAnnouncement(`${payload.data?.name ?? trimmedName} atualizado com sucesso.`);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Não foi possível salvar o método.");
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setSaving(false);
    }
  }

  function beginReorder() {
    setDraftOrder(methods);
    setOrderError(null);
    reorderIdempotencyKeyRef.current = crypto.randomUUID();
    setReordering(true);
  }

  function cancelReorder() {
    reorderIdempotencyKeyRef.current = null;
    setReordering(false);
  }

  function moveMethod(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= draftOrder.length) return;
    setDraftOrder((current) => move(current, index, target));
    setAnnouncement(`${draftOrder[index].name} movido para a posição ${target + 1}.`);
  }

  async function saveOrder() {
    if (saving) return;
    const idempotencyKey = reorderIdempotencyKeyRef.current ?? crypto.randomUUID();
    reorderIdempotencyKeyRef.current = idempotencyKey;
    setSaving(true);
    setOrderError(null);
    try {
      const response = await fetch("/api/vendas/admin/payment-methods/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderedMethodIds: draftOrder.map((method) => method.id),
          expectedOrderRevision: orderRevision,
          idempotencyKey,
        }),
      });
      const payload = (await response.json()) as { data?: SalesAdminPaymentMethodOrder } & ApiError;
      if (!response.ok) {
        if (payload.error?.details) {
          const positions = new Map(payload.error.details.orderedMethodIds.map((id, index) => [id, index]));
          setDraftOrder((current) => [...current].sort((a, b) => (positions.get(a.id) ?? 9999) - (positions.get(b.id) ?? 9999)));
          setOrderRevision(payload.error.details.orderRevision);
        }
        throw new Error(payload.error?.message || "Não foi possível salvar a ordem.");
      }
      await load();
      reorderIdempotencyKeyRef.current = null;
      setReordering(false);
      setAnnouncement("Ordem dos métodos salva com sucesso.");
    } catch (cause) {
      setOrderError(cause instanceof Error ? cause.message : "Não foi possível salvar a ordem.");
    } finally {
      setSaving(false);
    }
  }

  const orderIndex = new Map(methods.map((method, index) => [method.id, index + 1]));
  const usagePct = (id: string) => usageTotal > 0 ? Math.round((100 * (usage[id] ?? 0)) / usageTotal) : 0;

  const columns: DataTableColumn<SalesAdminPaymentMethod>[] = [
    { key: "sortOrder", header: "Ordem", render: (method) => <span className="tabular-nums">{orderIndex.get(method.id) ?? "—"}</span> },
    { key: "name", header: "Método", sortable: true, render: (method) => <span className="font-medium">{method.name}</span> },
    {
      key: "usage",
      header: "Uso (período aberto)",
      render: (method) => usageTotal === 0
        ? <span className="text-sm text-muted-foreground">—</span>
        : <span className="text-sm tabular-nums">{usage[method.id] ?? 0} venda(s) · {usagePct(method.id)}%</span>,
    },
    {
      key: "isActive",
      header: "Status",
      render: (method) => <StatusBadge status={method.isActive ? "success" : "neutral"} size="md">{method.isActive ? "Ativo" : "Inativo"}</StatusBadge>,
    },
    {
      key: "actions",
      header: "Ações",
      className: "text-right",
      render: (method) => (
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="icon" className="size-11" aria-label={`Editar ${method.name}`} onClick={() => openEditor(method)}><Pencil aria-hidden /></Button>
          <Button variant="outline" className="min-h-11" onClick={() => setPendingToggle(method)}>{method.isActive ? "Desativar" : "Ativar"}</Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <div aria-live="polite" className="sr-only">{announcement}</div>
      <PageHeader eyebrow="Administração comercial" title="Métodos de pagamento" className="items-start gap-4 max-sm:flex-col">
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
          {!reordering && methods.length > 1 && <Button variant="outline" className="min-h-11 flex-1 sm:flex-none" onClick={beginReorder}>Reordenar</Button>}
          <Button className="min-h-11 flex-1 sm:flex-none" onClick={() => openEditor("new")}><Plus aria-hidden /> Novo método</Button>
        </div>
      </PageHeader>
      <p className="mb-6 max-w-2xl text-sm text-muted-foreground">Defina as formas disponíveis em novas vendas. Desativar preserva todo o histórico.</p>

      {reordering ? (
        <Card>
          <CardContent className="p-4 md:p-6">
            <div className="mb-5">
              <h2 className="font-semibold">Definir ordem de exibição</h2>
              <p className="text-sm text-muted-foreground">Use os botões para mover cada item. A alteração só ocorre ao salvar.</p>
            </div>
            {orderError && <div role="alert" className="mb-4 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-foreground">{orderError}</div>}
            <ol className="space-y-2">
              {draftOrder.map((method, index) => (
                <li key={method.id} className="flex min-h-14 items-center gap-3 rounded-lg border border-border bg-card p-2">
                  <span className="w-7 text-center text-sm tabular-nums text-muted-foreground" aria-label={`Posição ${index + 1}`}>{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{method.name}</span>
                  <Button variant="outline" size="icon" className="size-11" disabled={index === 0 || saving} aria-label={`Mover ${method.name} para cima`} onClick={() => moveMethod(index, -1)}><ArrowUp aria-hidden /></Button>
                  <Button variant="outline" size="icon" className="size-11" disabled={index === draftOrder.length - 1 || saving} aria-label={`Mover ${method.name} para baixo`} onClick={() => moveMethod(index, 1)}><ArrowDown aria-hidden /></Button>
                </li>
              ))}
            </ol>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" className="min-h-11" disabled={saving} onClick={cancelReorder}>Cancelar</Button>
              <Button className="min-h-11" disabled={saving} onClick={() => void saveOrder()}>{saving ? "Salvando..." : "Salvar ordem"}</Button>
            </div>
          </CardContent>
        </Card>
      ) : error ? (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <p className="font-medium text-destructive">Métodos indisponíveis</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" className="mt-4 min-h-11" onClick={load}>Tentar novamente</Button>
        </div>
      ) : (
        <Card><CardContent className="p-4 md:p-6">
          <DataTable
            columns={columns}
            data={methods}
            loading={loading}
            keyExtractor={(method) => method.id}
            emptyState={{ icon: CreditCard, title: "Nenhum método cadastrado", description: "Cadastre a primeira forma de pagamento aceita." }}
            mobileCard={(method) => (
              <Card className="shadow-none"><CardContent className="space-y-4 p-4">
                <div className="flex items-center justify-between gap-3"><p className="font-medium">{method.name}</p><StatusBadge status={method.isActive ? "success" : "neutral"} size="md">{method.isActive ? "Ativo" : "Inativo"}</StatusBadge></div>
                <p className="text-xs text-muted-foreground">Posição {method.sortOrder + 1}</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="min-h-11" onClick={() => openEditor(method)}><Pencil aria-hidden /> Editar</Button>
                  <Button variant="outline" className="min-h-11" onClick={() => setPendingToggle(method)}>{method.isActive ? "Desativar" : "Ativar"}</Button>
                </div>
              </CardContent></Card>
            )}
          />
        </CardContent></Card>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && !saving && setEditing(null)}>
        <DialogContent className="sales-theme w-[calc(100%-2rem)] motion-reduce:duration-0">
          <DialogHeader><DialogTitle>{editing === "new" ? "Novo método" : "Editar método"}</DialogTitle><DialogDescription>O nome é normalizado pelo servidor para evitar duplicidade. Um registro inativo existente pode ser reativado.</DialogDescription></DialogHeader>
          {formError && <div ref={errorRef} tabIndex={-1} role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{formError}</div>}
          <div className="space-y-2"><Label htmlFor="payment-method-name">Nome</Label><Input ref={nameRef} id="payment-method-name" value={name} maxLength={120} disabled={saving} className="min-h-11" onChange={(event) => setName(event.target.value)} /></div>
          <DialogFooter className="gap-2"><Button variant="outline" className="min-h-11" disabled={saving} onClick={() => setEditing(null)}>Cancelar</Button><Button className="min-h-11" disabled={saving} onClick={() => editing && void persistMethod(editing, editing === "new" ? true : editing.isActive)}>{saving ? "Salvando..." : "Salvar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={pendingToggle !== null} onOpenChange={(open) => !open && !saving && setPendingToggle(null)}>
        <AlertDialogContent className="sales-theme w-[calc(100%-2rem)] motion-reduce:duration-0">
          <AlertDialogHeader><AlertDialogTitle>{pendingToggle?.isActive ? "Desativar método?" : "Ativar método?"}</AlertDialogTitle><AlertDialogDescription>{pendingToggle?.isActive ? `${pendingToggle.name} deixará de aparecer em novas vendas, mas continuará legível no histórico.` : `${pendingToggle?.name ?? "O método"} voltará a aparecer em novas vendas.`}</AlertDialogDescription></AlertDialogHeader>
          {formError && <div ref={errorRef} tabIndex={-1} role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{formError}</div>}
          <AlertDialogFooter><AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={(event) => { event.preventDefault(); if (pendingToggle) void persistMethod(pendingToggle, !pendingToggle.isActive, pendingToggle.name); }}>{saving ? "Salvando..." : "Confirmar"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

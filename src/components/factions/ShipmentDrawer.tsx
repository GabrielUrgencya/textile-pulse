"use client";

import * as React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getShipmentStatusMeta } from "@/lib/shipment-status";
import { showToast } from "@/lib/toast";
import { CalendarClock, EyeOff, Lock, PackageCheck, RotateCcw, Wallet } from "lucide-react";

/**
 * Drawer lateral da remessa (épico Robustez F3): informações completas,
 * timeline de eventos, observações e ações condicionais. Aberto ao clicar
 * em qualquer linha de remessa (ativa ou histórico) no FactionDetail.
 */

interface DrawerShipment {
  id: string;
  status: string;
  quantity_sent: number | null;
  quantity_returned: number | null;
  quantity_defective: number | null;
  shortage_qty: number | null;
  sent_at: string | null;
  expected_return_at: string | null;
  actual_return_at: string | null;
  closed_at: string | null;
  closed_by: string | null;
  created_at: string;
  released_value: number | null;
  retained_value: number | null;
  payment_status: string | null;
  reconciliation_status: string | null;
  factions?: { name?: string | null } | null;
  lots?: { barcode?: string | null; production_orders?: { op_number?: string | null; product_name?: string | null } | null } | null;
}

interface ShipmentEvent {
  id: string;
  event_type: string;
  actor_type: string;
  actor_name: string | null;
  visible_to_faction: boolean;
  payload: Record<string, unknown>;
  created_at: string;
}

const EVENT_LABELS: Record<string, string> = {
  CREATED: "Criada",
  SENT: "Enviada",
  CONFIRMED: "Recebimento confirmado pela facção",
  RETURN_DECLARED: "Devolução declarada",
  RECEIVED: "Devolução recebida",
  RECONCILED: "Conferência realizada",
  PAYMENT: "Pagamento atualizado",
  NOTE: "Observação",
  DEADLINE_CHANGED: "Prazo alterado",
  CLOSED: "Encerrada",
  REOPENED: "Reaberta",
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dt = (s: string | null) =>
  s ? new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
const d = (s: string | null) => (s ? new Date(s).toLocaleDateString("pt-BR") : "—");

function eventDetail(ev: ShipmentEvent): string | null {
  const p = ev.payload || {};
  switch (ev.event_type) {
    case "RECONCILED":
      return `Boas: ${p.ok ?? "—"} · Defeituosas: ${p.defective ?? "—"} · Faltantes: ${p.shortage ?? "—"} (${p.reconciliation_status ?? "—"})`;
    case "PAYMENT":
      return `Ação: ${p.action ?? "—"} · Liberado: ${brl(Number(p.released || 0))} · Retido: ${brl(Number(p.retained || 0))}`;
    case "NOTE":
      return String(p.text ?? "");
    case "DEADLINE_CHANGED":
      return `${d(p.from as string | null)} → ${d(p.to as string | null)}`;
    case "REOPENED":
      return `Voltou para ${p.restored_status ?? "—"}`;
    default:
      return null;
  }
}

export function ShipmentDrawer({
  shipmentId,
  onOpenChange,
  onEditPayment,
  onReceive,
  onChanged,
}: {
  shipmentId: string | null;
  onOpenChange: (open: boolean) => void;
  /** Reusa o ShipmentPaymentDialog do FactionDetail. */
  onEditPayment: () => void;
  /** Reusa o fluxo de conferência (ShipmentReceive) do FactionDetail. */
  onReceive: () => void;
  /** Refetch da lista após ações que mudam estado. */
  onChanged: () => void;
}) {
  const [loading, setLoading] = React.useState(false);
  const [shipment, setShipment] = React.useState<DrawerShipment | null>(null);
  const [events, setEvents] = React.useState<ShipmentEvent[]>([]);
  const [noteText, setNoteText] = React.useState("");
  const [noteVisible, setNoteVisible] = React.useState(true);
  const [savingNote, setSavingNote] = React.useState(false);
  const [deadlineOpen, setDeadlineOpen] = React.useState(false);
  const [deadlineValue, setDeadlineValue] = React.useState("");
  const [closeOpen, setCloseOpen] = React.useState(false);
  const [reopenOpen, setReopenOpen] = React.useState(false);
  const [acting, setActing] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!shipmentId) return;
    const res = await fetch(`/api/shipments/${shipmentId}/events`);
    if (!res.ok) return;
    const json = await res.json();
    setShipment(json.data?.shipment ?? null);
    setEvents(json.data?.events ?? []);
  }, [shipmentId]);

  React.useEffect(() => {
    if (!shipmentId) {
      setShipment(null);
      setEvents([]);
      setNoteText("");
      return;
    }
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [shipmentId, load]);

  const meta = getShipmentStatusMeta(shipment?.status);
  const isActive = shipment ? !["RETURNED", "CLOSED"].includes(shipment.status) : false;
  const canClose = shipment ? ["RETURNED", "PARTIALLY_RETURNED"].includes(shipment.status) : false;
  const canPay = shipment ? ["RETURNED", "PARTIALLY_RETURNED", "CLOSED"].includes(shipment.status) : false;
  const canReceive = shipment?.status === "RETURN_DECLARED";

  const addNote = async () => {
    if (!shipmentId || !noteText.trim()) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/shipments/${shipmentId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: noteText.trim(), visibleToFaction: noteVisible }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Erro ao salvar observação");
      setNoteText("");
      showToast("success", "Observação adicionada");
      load();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao salvar observação");
    } finally {
      setSavingNote(false);
    }
  };

  const changeDeadline = async () => {
    if (!shipmentId || !deadlineValue) return;
    setActing(true);
    try {
      const res = await fetch(`/api/shipments/${shipmentId}/deadline`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedReturn: new Date(`${deadlineValue}T12:00:00`).toISOString() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Erro ao atualizar prazo");
      showToast("success", "Prazo atualizado");
      setDeadlineOpen(false);
      load();
      onChanged();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao atualizar prazo");
    } finally {
      setActing(false);
    }
  };

  const closeShipment = async () => {
    if (!shipmentId) return;
    setActing(true);
    try {
      const res = await fetch(`/api/shipments/${shipmentId}/close`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const missing = Array.isArray(body.missing) ? ` — ${body.missing.join("; ")}` : "";
        throw new Error(`${body.error || "Erro ao encerrar"}${missing}`);
      }
      showToast("success", "Remessa encerrada");
      setCloseOpen(false);
      load();
      onChanged();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao encerrar");
    } finally {
      setActing(false);
    }
  };

  const reopenShipment = async () => {
    if (!shipmentId) return;
    setActing(true);
    try {
      const res = await fetch(`/api/shipments/${shipmentId}/reopen`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Erro ao reabrir");
      showToast("success", "Remessa reaberta");
      setReopenOpen(false);
      load();
      onChanged();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao reabrir");
    } finally {
      setActing(false);
    }
  };

  return (
    <Sheet open={!!shipmentId} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-[480px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            Remessa {shipment?.lots?.barcode || ""}
            {shipment && <StatusBadge status={meta.tone}>{meta.label}</StatusBadge>}
          </SheetTitle>
          <SheetDescription>
            {shipment?.factions?.name || "—"} · OP {shipment?.lots?.production_orders?.op_number || "—"} ·{" "}
            {shipment?.lots?.production_orders?.product_name || "—"}
          </SheetDescription>
        </SheetHeader>

        {loading && (
          <div className="mt-4 space-y-3">
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-40 w-full rounded-lg" />
          </div>
        )}

        {!loading && shipment && (
          <div className="mt-4 space-y-6">
            {/* ─── Informações ─── */}
            <section className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-border/60 p-3 text-[13px]">
              <div><span className="text-muted-foreground">Enviada em:</span> {d(shipment.sent_at)}</div>
              <div><span className="text-muted-foreground">Prazo:</span> {d(shipment.expected_return_at)}</div>
              <div><span className="text-muted-foreground">Devolvida em:</span> {d(shipment.actual_return_at)}</div>
              <div>
                <span className="text-muted-foreground">Encerrada:</span>{" "}
                {shipment.closed_at ? `${d(shipment.closed_at)} (${shipment.closed_by || "—"})` : "—"}
              </div>
              <div><span className="text-muted-foreground">Enviadas:</span> {shipment.quantity_sent ?? 0}</div>
              <div><span className="text-muted-foreground">Aprovadas:</span> {shipment.quantity_returned ?? 0}</div>
              <div><span className="text-muted-foreground">Defeituosas:</span> {shipment.quantity_defective ?? 0}</div>
              <div><span className="text-muted-foreground">Faltantes:</span> {shipment.shortage_qty ?? "—"}</div>
              <div><span className="text-muted-foreground">Liberado:</span> {brl(Number(shipment.released_value || 0))}</div>
              <div><span className="text-muted-foreground">Retido:</span> {brl(Number(shipment.retained_value || 0))}</div>
              <div className="col-span-2">
                <span className="text-muted-foreground">Pagamento:</span> {shipment.payment_status || "PENDING"}
                {shipment.reconciliation_status && (
                  <> · <span className="text-muted-foreground">Conferência:</span> {shipment.reconciliation_status}</>
                )}
              </div>
            </section>

            {/* ─── Ações ─── */}
            <section className="flex flex-wrap gap-2">
              {isActive && shipment.status !== "RETURN_DECLARED" && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
                  setDeadlineValue(shipment.expected_return_at ? shipment.expected_return_at.slice(0, 10) : "");
                  setDeadlineOpen(true);
                }}>
                  <CalendarClock className="size-3.5" /> Editar prazo
                </Button>
              )}
              {canReceive && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={onReceive}>
                  <PackageCheck className="size-3.5" /> Conferir devolução
                </Button>
              )}
              {canPay && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={onEditPayment}>
                  <Wallet className="size-3.5" /> Pagamento
                </Button>
              )}
              {canClose && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setCloseOpen(true)}>
                  <Lock className="size-3.5" /> Encerrar
                </Button>
              )}
              {shipment.status === "CLOSED" && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setReopenOpen(true)}>
                  <RotateCcw className="size-3.5" /> Reabrir
                </Button>
              )}
            </section>

            {/* ─── Timeline ─── */}
            <section>
              <h4 className="mb-2 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
                Linha do tempo
              </h4>
              <ol className="relative ml-2 space-y-4 border-l border-border/60 pl-4">
                {events.length === 0 && (
                  <li className="relative">
                    <span className="absolute -left-[21px] top-1 size-2.5 rounded-full bg-muted-foreground" />
                    <p className="text-[13px] font-medium">Criada</p>
                    <p className="text-[12px] text-muted-foreground">{dt(shipment.created_at)}</p>
                  </li>
                )}
                {events.map((ev) => {
                  const detail = eventDetail(ev);
                  return (
                    <li key={ev.id} className="relative">
                      <span className="absolute -left-[21px] top-1 size-2.5 rounded-full bg-foreground/70" />
                      <p className="flex items-center gap-1.5 text-[13px] font-medium">
                        {EVENT_LABELS[ev.event_type] || ev.event_type}
                        {ev.event_type === "NOTE" && !ev.visible_to_faction && (
                          <EyeOff className="size-3 text-muted-foreground" aria-label="Interna (facção não vê)" />
                        )}
                      </p>
                      {detail && <p className="text-[13px] text-foreground/80 whitespace-pre-wrap">{detail}</p>}
                      <p className="text-[12px] text-muted-foreground">
                        {ev.actor_name || (ev.actor_type === "SYSTEM" ? "Sistema" : ev.actor_type === "FACTION" ? "Facção" : "Admin")} · {dt(ev.created_at)}
                      </p>
                    </li>
                  );
                })}
              </ol>
            </section>

            {/* ─── Observações ─── */}
            <section className="space-y-2">
              <h4 className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
                Adicionar observação
              </h4>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                maxLength={2000}
                rows={3}
                placeholder="Escreva uma observação sobre a remessa…"
                className="w-full rounded-lg border border-border bg-background p-2 text-[13px] outline-none focus:border-foreground/40"
              />
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={noteVisible}
                    onChange={(e) => setNoteVisible(e.target.checked)}
                    className="size-3.5 accent-foreground"
                  />
                  Visível para a facção
                </label>
                <Button size="sm" onClick={addNote} disabled={savingNote || !noteText.trim()}>
                  {savingNote ? "Salvando…" : "Adicionar"}
                </Button>
              </div>
            </section>
          </div>
        )}

        {/* ─── Confirmações ─── */}
        <ConfirmDialog
          open={closeOpen}
          onCancel={() => setCloseOpen(false)}
          onConfirm={closeShipment}
          title="Encerrar remessa?"
          description="A remessa vai para o histórico nos dois lados. Requisitos: devolução recebida, conferida e financeiro lançado — o servidor valida e informa o que faltar."
          confirmLabel="Encerrar"
          loading={acting}
        />
        <ConfirmDialog
          open={reopenOpen}
          onCancel={() => setReopenOpen(false)}
          onConfirm={reopenShipment}
          title="Reabrir remessa?"
          description="A remessa volta ao status anterior ao encerramento, com registro na linha do tempo."
          confirmLabel="Reabrir"
          loading={acting}
        />
        <Dialog open={deadlineOpen} onOpenChange={(open) => !open && setDeadlineOpen(false)}>
          <DialogContent className="sm:max-w-[380px]">
            <DialogHeader>
              <DialogTitle>Editar prazo de devolução</DialogTitle>
              <DialogDescription>A facção será notificada sobre o novo prazo.</DialogDescription>
            </DialogHeader>
            <input
              type="date"
              value={deadlineValue}
              onChange={(e) => setDeadlineValue(e.target.value)}
              className="w-full rounded-lg border border-border bg-background p-2 text-[14px]"
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeadlineOpen(false)} disabled={acting}>
                Cancelar
              </Button>
              <Button onClick={changeDeadline} disabled={acting || !deadlineValue}>
                {acting ? "Salvando…" : "Salvar prazo"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}

"use client";

import * as React from "react";
import { Wallet, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { showToast } from "@/lib/toast";
import type { FactionShipment } from "@/hooks/use-factions-data";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shipment: FactionShipment | null;
  onSuccess: () => void;
}

const brl = (v: number | null | undefined) =>
  `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendente",
  PARTIALLY_RELEASED: "Parcialmente liberado",
  RELEASED: "Liberado",
  PAID: "Pago",
};

const STATUS_TONE: Record<string, "success" | "warning" | "neutral"> = {
  PENDING: "neutral",
  PARTIALLY_RELEASED: "warning",
  RELEASED: "success",
  PAID: "success",
};

/**
 * Painel de pagamento da remessa (admin): breakdown + liberar retido / editar /
 * marcar como pago. Chama PATCH /api/shipments/[id]/payment.
 */
export function ShipmentPaymentDialog({ open, onOpenChange, shipment, onSuccess }: Props) {
  const [loading, setLoading] = React.useState(false);
  const [mode, setMode] = React.useState<"view" | "release" | "edit">("view");
  const [releaseAmount, setReleaseAmount] = React.useState("");
  const [editReleased, setEditReleased] = React.useState("");
  const [editRetained, setEditRetained] = React.useState("");
  const [editReason, setEditReason] = React.useState("");

  const retained = Number(shipment?.retained_value || 0);
  const released = Number(shipment?.released_value || 0);
  const status = shipment?.payment_status || "PENDING";
  const isPaid = status === "PAID";

  React.useEffect(() => {
    if (open && shipment) {
      setMode("view");
      setReleaseAmount(String(retained.toFixed(2)));
      setEditReleased(String(released.toFixed(2)));
      setEditRetained(String(retained.toFixed(2)));
      setEditReason("");
    }
  }, [open, shipment, retained, released]);

  async function call(payload: Record<string, unknown>, successMsg: string) {
    if (!shipment) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/shipments/${shipment.id}/payment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || body.error || "Erro na operação");
      showToast("success", successMsg);
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wallet className="size-4" /> Pagamento da remessa</DialogTitle>
          <DialogDescription>Libere, ajuste ou registre o pagamento desta remessa.</DialogDescription>
        </DialogHeader>

        {/* Herói — o valor que importa */}
        <div className="mt-2 rounded-lg bg-success/10 p-4 flex items-end justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {isPaid ? "Pago" : "A pagar"}
            </p>
            <p className="font-mono text-[28px] font-bold leading-none text-success">{brl(released)}</p>
          </div>
          <StatusBadge status={STATUS_TONE[status] || "neutral"} size="md">
            {STATUS_LABEL[status] || status}
            {isPaid && shipment?.paid_at ? ` · ${new Date(shipment.paid_at).toLocaleDateString("pt-BR")}` : ""}
          </StatusBadge>
        </div>

        {/* Breakdown detalhado */}
        <div className="rounded-lg border border-border/50 divide-y divide-border/40 text-sm mt-2">
          <Row label="Bruto (boas)" value={brl(shipment?.payment_value)} />
          <Row label="Dedução (defeito)" value={brl(shipment?.deduction_value)} tone="text-destructive" />
          <Row label="Retido" value={brl(retained)} tone={retained > 0 ? "text-warning" : undefined} bold={retained > 0} />
        </div>

        {mode === "view" && (
          <div className="space-y-2 mt-2">
            {retained > 0 && !isPaid && (
              <Button variant="outline" className="w-full" onClick={() => setMode("release")}>
                Liberar retido
              </Button>
            )}
            {!isPaid && (
              <Button variant="outline" className="w-full" onClick={() => setMode("edit")}>
                Editar valores
              </Button>
            )}
            {!isPaid && released > 0 && (
              <Button className="w-full" disabled={loading}
                onClick={() => call({ action: "mark-paid" }, "Pagamento registrado")}>
                <Check className="size-4 mr-1" /> Marcar como pago
              </Button>
            )}
            {isPaid && (
              <Button variant="outline" className="w-full" disabled={loading}
                onClick={() => call({ action: "unmark-paid" }, "Pagamento revertido")}>
                Reverter pagamento
              </Button>
            )}
          </div>
        )}

        {mode === "release" && (
          <div className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label>Valor a liberar (máx. {brl(retained)})</Label>
              <Input className="input-field font-mono" type="number" min="0" step="0.01" max={retained}
                value={releaseAmount} onChange={(e) => setReleaseAmount(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setMode("view")}>Voltar</Button>
              <Button className="flex-1" disabled={loading}
                onClick={() => call({ action: "release", amount: Number(releaseAmount) }, "Valor liberado")}>
                Liberar
              </Button>
            </div>
          </div>
        )}

        {mode === "edit" && (
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Liberado</Label>
                <Input className="input-field font-mono" type="number" min="0" step="0.01"
                  value={editReleased} onChange={(e) => setEditReleased(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Retido</Label>
                <Input className="input-field font-mono" type="number" min="0" step="0.01"
                  value={editRetained} onChange={(e) => setEditRetained(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Motivo (auditoria)</Label>
              <Input className="input-field" value={editReason} onChange={(e) => setEditReason(e.target.value)}
                placeholder="Ex.: acordo com a facção" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setMode("view")}>Voltar</Button>
              <Button className="flex-1" disabled={loading}
                onClick={() => call({ action: "edit", releasedValue: Number(editReleased), retainedValue: Number(editRetained), reason: editReason.trim() || null }, "Valores atualizados")}>
                Salvar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, tone, bold }: { label: string; value: string; tone?: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono ${tone || ""} ${bold ? "font-semibold" : ""}`}>{value}</span>
    </div>
  );
}

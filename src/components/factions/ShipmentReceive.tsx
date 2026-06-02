"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { showToast } from "@/lib/toast";
import type { FactionShipment } from "@/hooks/use-factions-data";

interface ShipmentReceiveProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shipment: FactionShipment | null;
  onSuccess: () => void;
}

function ShipmentReceive({ open, onOpenChange, shipment, onSuccess }: ShipmentReceiveProps) {
  const [quantity, setQuantity] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (open && shipment) {
      setQuantity(String(shipment.total_quantity));
      setNotes("");
    }
  }, [open, shipment]);

  const returnedQty = parseInt(quantity) || 0;
  const diff = shipment ? shipment.total_quantity - returnedQty : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shipment) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/shipments/${shipment.id}/receive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          returnedQuantity: returnedQty,
          notes: notes.trim() || null,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Erro ao receber devolução");
      }

      showToast("success", "Devolução recebida");
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro inesperado");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Receber Devolução</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="text-sm text-muted-foreground">
            Quantidade enviada: <span className="font-mono font-medium text-foreground">{shipment?.total_quantity || 0}</span> peças
          </div>

          <div className="space-y-1.5">
            <Label>Quantidade devolvida</Label>
            <Input
              className="input-field font-mono"
              type="number"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>

          {diff > 0 && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning">
              Atenção: {diff} peça{diff > 1 ? "s" : ""} a menos que o enviado.
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea
              className="input-field min-h-[80px]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas sobre a devolução..."
            />
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Processando..." : "Confirmar Recebimento"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { ShipmentReceive };

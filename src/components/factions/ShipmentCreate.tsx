"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { showToast } from "@/lib/toast";

interface ShipmentCreateProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  factionId: string;
  onSuccess: () => void;
}

interface Lot {
  id: string;
  code: string;
  quantity: number;
  op_code?: string;
}

function ShipmentCreate({ open, onOpenChange, factionId, onSuccess }: ShipmentCreateProps) {
  const [lots, setLots] = React.useState<Lot[]>([]);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [expectedReturn, setExpectedReturn] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [step, setStep] = React.useState<"select" | "confirm">("select");

  React.useEffect(() => {
    if (open) {
      setSelectedIds(new Set());
      setExpectedReturn("");
      setNotes("");
      setStep("select");
      // Fetch available lots
      fetch("/api/production/lots?available=true")
        .then((r) => r.json())
        .then((json) => setLots(json.data || []))
        .catch(() => setLots([]));
    }
  }, [open]);

  const toggleLot = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedLots = lots.filter((l) => selectedIds.has(l.id));
  const totalPieces = selectedLots.reduce((s, l) => s + l.quantity, 0);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/shipments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          factionId,
          lotIds: Array.from(selectedIds),
          expectedReturn,
          notes: notes.trim() || null,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Erro ao criar remessa");
      }

      showToast("success", "Remessa criada");
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
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "select" ? "Selecionar Lotes" : "Confirmar Remessa"}
          </DialogTitle>
          <DialogDescription>Crie uma nova remessa para a facção.</DialogDescription>
        </DialogHeader>

        {step === "select" ? (
          <div className="space-y-4 mt-2">
            {lots.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum lote disponível para envio
              </p>
            ) : (
              <div className="max-h-[300px] overflow-y-auto space-y-1">
                {lots.map((lot) => (
                  <label
                    key={lot.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-secondary/30 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedIds.has(lot.id)}
                      onCheckedChange={() => toggleLot(lot.id)}
                    />
                    <div className="flex-1">
                      <span className="font-mono text-sm">{lot.code}</span>
                      {lot.op_code && (
                        <span className="text-xs text-muted-foreground ml-2">OP: {lot.op_code}</span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">
                      {lot.quantity} pçs
                    </span>
                  </label>
                ))}
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Prazo de devolução</Label>
              <Input
                className="input-field"
                type="date"
                value={expectedReturn}
                onChange={(e) => setExpectedReturn(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Motorista / Observações</Label>
              <Input
                className="input-field"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Nome do motorista (opcional)"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-sm text-muted-foreground">
                {selectedIds.size} lote{selectedIds.size !== 1 ? "s" : ""} · {totalPieces} peças
              </span>
              <Button
                onClick={() => setStep("confirm")}
                disabled={selectedIds.size === 0 || !expectedReturn}
              >
                Revisar
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            <div className="rounded-lg border border-border/40 bg-secondary/20 p-4 space-y-2">
              <div className="text-sm"><strong>Lotes:</strong> {selectedIds.size}</div>
              <div className="text-sm"><strong>Total peças:</strong> {totalPieces}</div>
              <div className="text-sm"><strong>Prazo:</strong> {expectedReturn}</div>
              {notes && <div className="text-sm"><strong>Obs:</strong> {notes}</div>}
            </div>

            <div className="space-y-1">
              {selectedLots.map((lot) => (
                <div key={lot.id} className="flex justify-between text-xs px-2 py-1 bg-secondary/10 rounded">
                  <span className="font-mono">{lot.code}</span>
                  <span className="text-muted-foreground">{lot.quantity} pçs</span>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("select")} className="flex-1">
                Voltar
              </Button>
              <Button onClick={handleSubmit} disabled={loading} className="flex-1">
                {loading ? "Enviando..." : "Enviar Remessa"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export { ShipmentCreate };

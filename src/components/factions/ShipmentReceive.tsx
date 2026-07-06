"use client";

import * as React from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { showToast } from "@/lib/toast";
import type { FactionShipment } from "@/hooks/use-factions-data";

interface ShipmentReceiveProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shipment: FactionShipment | null;
  onSuccess: () => void;
}

interface ReconResult {
  status: string;
  reconciliationStatus: "OK" | "SHORTAGE" | "DISCREPANCY";
  shortageQty: number;
  declaredOk: number;
  declaredDefect: number;
  countedOk: number;
  countedDefect: number;
  paymentValue: number | null;
  paymentBlocked: boolean;
  defectRecorded?: boolean;
}

/**
 * Conferência CEGA da devolução (fábrica). Passo 1: digitar o código de
 * devolução + contar peças boas/defeito SEM ver o declarado. Passo 2: o servidor
 * reconcilia e revela declarado × conferido.
 */
function ShipmentReceive({ open, onOpenChange, shipment, onSuccess }: ShipmentReceiveProps) {
  const [returnCode, setReturnCode] = React.useState("");
  const [countedOk, setCountedOk] = React.useState("");
  const [countedDefect, setCountedDefect] = React.useState("");
  const [defectType, setDefectType] = React.useState("");
  const [severity, setSeverity] = React.useState("");
  const [defectDescription, setDefectDescription] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ReconResult | null>(null);

  React.useEffect(() => {
    if (open) {
      setReturnCode("");
      setCountedOk("");
      setCountedDefect("");
      setDefectType("");
      setSeverity("");
      setDefectDescription("");
      setError(null);
      setResult(null);
    }
  }, [open, shipment]);

  const sent = shipment?.total_quantity ?? 0;
  const hasDefect = (parseInt(countedDefect) || 0) > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shipment) return;
    setError(null);

    const ok = parseInt(countedOk) || 0;
    const defect = parseInt(countedDefect) || 0;
    if (returnCode.trim().length !== 6) { setError("Digite o código de devolução (6 dígitos)."); return; }
    if (ok + defect > sent) { setError(`Contagem (${ok + defect}) maior que o enviado (${sent}).`); return; }
    if (defect > 0 && (!defectType || !severity)) { setError("Informe o tipo e a severidade do defeito."); return; }

    setLoading(true);
    try {
      const res = await fetch(`/api/shipments/${shipment.id}/receive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          returnCode: returnCode.trim(),
          countedOk: ok,
          countedDefect: defect,
          defectType: defect > 0 ? defectType : undefined,
          severity: defect > 0 ? severity : undefined,
          defectDescription: defect > 0 ? (defectDescription.trim() || undefined) : undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.message || body.error || "Erro ao conferir devolução");
        return;
      }
      setResult(body.data as ReconResult);
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const finish = () => {
    showToast("success", "Devolução conferida");
    onOpenChange(false);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Conferir Devolução</DialogTitle>
          <DialogDescription>
            {result ? "Resultado da reconciliação." : "Digite o código do motorista e conte as peças recebidas."}
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Código de devolução</Label>
              <Input
                className="input-field font-mono text-center tracking-[0.3em] text-lg"
                inputMode="numeric"
                maxLength={6}
                value={returnCode}
                onChange={(e) => setReturnCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Peças boas</Label>
                <Input className="input-field font-mono text-center text-lg" type="number" min="0"
                  value={countedOk} onChange={(e) => setCountedOk(e.target.value.replace(/\D/g, ""))} />
              </div>
              <div className="space-y-1.5">
                <Label>Com defeito</Label>
                <Input className="input-field font-mono text-center text-lg" type="number" min="0"
                  value={countedDefect} onChange={(e) => setCountedDefect(e.target.value.replace(/\D/g, ""))} />
              </div>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              Enviado: <span className="font-mono text-foreground">{sent}</span> peças. Conte sem consultar a declaração.
            </p>

            {hasDefect && (
              <div className="space-y-3 rounded-lg border border-warning/30 bg-warning/5 p-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-warning shrink-0" />
                  <p className="text-sm font-medium text-warning">Detalhes do defeito</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Tipo</Label>
                    <Select value={defectType} onValueChange={setDefectType}>
                      <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="COSTURA">Costura</SelectItem>
                        <SelectItem value="TECIDO">Tecido</SelectItem>
                        <SelectItem value="AVIAMENTO">Aviamento</SelectItem>
                        <SelectItem value="OUTRO">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Severidade</Label>
                    <Select value={severity} onValueChange={setSeverity}>
                      <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="LEVE">Leve</SelectItem>
                        <SelectItem value="MEDIO">Médio</SelectItem>
                        <SelectItem value="GRAVE">Grave</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Descrição (opcional)</Label>
                  <Textarea className="input-field min-h-[60px]" value={defectDescription}
                    onChange={(e) => setDefectDescription(e.target.value)}
                    placeholder="Ex.: costura solta na barra…" />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Ao registrar, a facção é notificada e pode confirmar ou contestar no portal.
                </p>
              </div>
            )}

            {error && <p role="alert" className="text-sm text-destructive text-center">{error}</p>}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Conferindo..." : "Conferir"}
            </Button>
          </form>
        ) : (
          <div className="space-y-4 mt-2">
            {result.reconciliationStatus === "OK" ? (
              <div className="flex flex-col items-center gap-2 rounded-lg bg-success/10 p-4 text-center">
                <CheckCircle2 className="size-8 text-success" />
                <p className="font-semibold text-success">Devolução conferida — tudo bate!</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 rounded-lg bg-warning/10 p-4 text-center">
                <AlertTriangle className="size-8 text-warning" />
                <p className="font-semibold text-warning">
                  {result.reconciliationStatus === "SHORTAGE" ? "Faltaram peças" : "Divergência na contagem"}
                </p>
                <p className="text-sm text-muted-foreground">Pagamento retido até resolução.</p>
              </div>
            )}

            <div className="rounded-lg border border-border/50 divide-y divide-border/40 text-sm">
              <div className="grid grid-cols-3 px-3 py-2 font-medium text-muted-foreground">
                <span></span><span className="text-center">Declarado</span><span className="text-center">Conferido</span>
              </div>
              <div className="grid grid-cols-3 px-3 py-2">
                <span>Boas</span>
                <span className="text-center font-mono">{result.declaredOk}</span>
                <span className={`text-center font-mono ${result.countedOk !== result.declaredOk ? "text-warning font-semibold" : ""}`}>{result.countedOk}</span>
              </div>
              <div className="grid grid-cols-3 px-3 py-2">
                <span>Defeito</span>
                <span className="text-center font-mono">{result.declaredDefect}</span>
                <span className={`text-center font-mono ${result.countedDefect !== result.declaredDefect ? "text-warning font-semibold" : ""}`}>{result.countedDefect}</span>
              </div>
              {result.shortageQty > 0 && (
                <div className="grid grid-cols-3 px-3 py-2 text-destructive">
                  <span>Faltante</span><span></span>
                  <span className="text-center font-mono font-semibold">{result.shortageQty}</span>
                </div>
              )}
            </div>

            {result.defectRecorded && (
              <p className="text-[13px] text-muted-foreground text-center">
                Defeito registrado — a facção foi notificada e pode responder ou contestar no portal.
              </p>
            )}

            <Button onClick={finish} className="w-full">Concluir</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export { ShipmentReceive };

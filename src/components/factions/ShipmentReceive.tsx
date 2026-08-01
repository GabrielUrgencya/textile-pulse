"use client";

import * as React from "react";
import { CheckCircle2, AlertTriangle, CheckSquare, ClockAlert, Plus } from "lucide-react";
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
  declaredOk?: number;
  declaredDefect?: number;
  countedOk: number;
  countedDefect: number;
  paymentValue: number | null;
  defectRecorded?: boolean;
}

type Phase = "choice" | "blind" | "hold" | "finalize" | "result";

/**
 * Conferência da devolução (Frente 3 — coexistência).
 *
 * RETURN_DECLARED → o admin ESCOLHE:
 *   • Conferir agora  → contagem cega + código do motorista (fluxo original).
 *   • Aguardar conf.  → recebe fisicamente (só o código); confere depois.
 * AWAITING_INSPECTION → tela de finalização: registra defeitos ao longo dos dias
 *   e, ao final, informa as boas conferidas — o financeiro fecha aqui.
 */
function ShipmentReceive({ open, onOpenChange, shipment, onSuccess }: ShipmentReceiveProps) {
  const isInspecting = shipment?.status === "AWAITING_INSPECTION";

  const [phase, setPhase] = React.useState<Phase>("choice");
  const [returnCode, setReturnCode] = React.useState("");
  const [countedOk, setCountedOk] = React.useState("");
  const [countedDefect, setCountedDefect] = React.useState("");
  const [defectType, setDefectType] = React.useState("");
  const [severity, setSeverity] = React.useState("");
  const [defectDescription, setDefectDescription] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ReconResult | null>(null);
  // Finalização: defeitos já somados desta remessa + form incremental.
  const [inspectionDefectQty, setInspectionDefectQty] = React.useState(0);
  const [showDefectForm, setShowDefectForm] = React.useState(false);

  const sent = shipment?.total_quantity ?? shipment?.quantity_sent ?? 0;
  const hasDefect = (parseInt(countedDefect) || 0) > 0;

  const fetchInspectionDefects = React.useCallback(async () => {
    if (!shipment) return;
    try {
      // Lemos os defeitos já vinculados a esta remessa (registrados na conferência).
      const res = await fetch(`/api/defects?shipment_id=${shipment.id}&limit=200`);
      if (res.ok) {
        const json = await res.json();
        const list = (json.defects || []) as Array<{ quantity?: number }>;
        setInspectionDefectQty(list.reduce((s, d) => s + (Number(d.quantity) || 0), 0));
      }
    } catch {
      // silencioso: a soma real é feita no servidor no finalize
    }
  }, [shipment]);

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
      setShowDefectForm(false);
      setInspectionDefectQty(0);
      setPhase(shipment?.status === "AWAITING_INSPECTION" ? "finalize" : "choice");
      if (shipment?.status === "AWAITING_INSPECTION") fetchInspectionDefects();
    }
  }, [open, shipment, fetchInspectionDefects]);

  // Conferência cega (fluxo original) — POST /receive.
  const submitBlind = async (e: React.FormEvent) => {
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
      if (!res.ok) { setError(body.message || body.error || "Erro ao conferir devolução"); return; }
      setResult(body.data as ReconResult);
      setPhase("result");
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  // Aguardar conferência — PATCH /hold-inspection (só o código, sem contar).
  const submitHold = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shipment) return;
    setError(null);
    if (returnCode.trim().length !== 6) { setError("Digite o código de devolução (6 dígitos)."); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/shipments/${shipment.id}/hold-inspection`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnCode: returnCode.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.message || body.error || "Erro ao receber"); return; }
      showToast("success", "Recebido — aguardando conferência");
      onOpenChange(false);
      onSuccess();
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  // Registrar defeito durante a conferência — POST /api/defects (vincula shipment_id).
  const registerDefect = async () => {
    if (!shipment?.lot_id) { setError("Lote da remessa não encontrado."); return; }
    const qty = parseInt(countedDefect) || 0;
    if (qty < 1) { setError("Informe a quantidade de peças com defeito."); return; }
    if (!defectType || !severity) { setError("Informe o tipo e a severidade."); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/defects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lot_id: shipment.lot_id,
          shipment_id: shipment.id,
          defect_type: defectType,
          severity,
          quantity: qty,
          description: defectDescription.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error || "Erro ao registrar defeito"); return; }
      showToast("success", `${qty} peça(s) com defeito registradas`);
      setInspectionDefectQty((n) => n + qty);
      setCountedDefect("");
      setDefectType("");
      setSeverity("");
      setDefectDescription("");
      setShowDefectForm(false);
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  // Finalizar conferência — PATCH /finalize-inspection (informa as boas).
  const submitFinalize = async () => {
    if (!shipment) return;
    const ok = parseInt(countedOk) || 0;
    if (ok + inspectionDefectQty > sent) { setError(`Boas (${ok}) + defeito (${inspectionDefectQty}) maior que o enviado (${sent}).`); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/shipments/${shipment.id}/finalize-inspection`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countedOk: ok }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.message || body.error || "Erro ao finalizar"); return; }
      setResult(body.data as ReconResult);
      setPhase("result");
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

  const title =
    phase === "result" ? "Resultado"
    : isInspecting ? "Finalizar conferência"
    : phase === "hold" ? "Receber devolução"
    : phase === "blind" ? "Conferir agora"
    : "Devolução chegou";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {phase === "result" ? "Resultado da reconciliação."
              : phase === "choice" ? "Como você quer receber esta devolução?"
              : phase === "finalize" ? "Registre defeitos e informe as peças boas conferidas."
              : phase === "hold" ? "Digite o código do motorista para receber."
              : "Digite o código e conte as peças recebidas."}
          </DialogDescription>
        </DialogHeader>

        {/* ESCOLHA (RETURN_DECLARED) */}
        {phase === "choice" && (
          <div className="space-y-3 mt-2">
            <button
              onClick={() => { setError(null); setPhase("blind"); }}
              className="w-full text-left rounded-xl border-2 border-primary/60 p-3.5 hover:bg-primary/5 transition-colors"
            >
              <p className="flex items-center gap-2 text-sm font-medium"><CheckSquare className="size-4" /> Conferir agora</p>
              <p className="text-xs text-muted-foreground mt-0.5">Conto tudo e fecho na hora. Ideal para lotes pequenos.</p>
            </button>
            <button
              onClick={() => { setError(null); setPhase("hold"); }}
              className="w-full text-left rounded-xl border border-border/60 p-3.5 hover:bg-secondary/30 transition-colors"
            >
              <p className="flex items-center gap-2 text-sm font-medium"><ClockAlert className="size-4" /> Aguardar conferência</p>
              <p className="text-xs text-muted-foreground mt-0.5">Recebo agora, confiro nos próximos dias. Ideal para lotes grandes.</p>
            </button>
          </div>
        )}

        {/* CONFERÊNCIA CEGA (fluxo original) */}
        {phase === "blind" && (
          <form onSubmit={submitBlind} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Código de devolução</Label>
              <Input
                className="input-field font-mono text-center tracking-[0.3em] text-lg"
                inputMode="numeric" maxLength={6} value={returnCode}
                onChange={(e) => setReturnCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000" autoFocus
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
              </div>
            )}
            {error && <p role="alert" className="text-sm text-destructive text-center">{error}</p>}
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => { setError(null); setPhase("choice"); }}>Voltar</Button>
              <Button type="submit" disabled={loading} className="flex-1">{loading ? "Conferindo..." : "Conferir"}</Button>
            </div>
          </form>
        )}

        {/* AGUARDAR CONFERÊNCIA (só o código) */}
        {phase === "hold" && (
          <form onSubmit={submitHold} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Código de devolução</Label>
              <Input
                className="input-field font-mono text-center tracking-[0.3em] text-lg"
                inputMode="numeric" maxLength={6} value={returnCode}
                onChange={(e) => setReturnCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000" autoFocus
              />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              A remessa fica <span className="text-warning">aguardando conferência</span>. Você confere e finaliza depois — o financeiro só fecha na finalização.
            </p>
            {error && <p role="alert" className="text-sm text-destructive text-center">{error}</p>}
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => { setError(null); setPhase("choice"); }}>Voltar</Button>
              <Button type="submit" disabled={loading} className="flex-1">{loading ? "Recebendo..." : "Receber"}</Button>
            </div>
          </form>
        )}

        {/* FINALIZAR (AWAITING_INSPECTION) */}
        {phase === "finalize" && (
          <div className="space-y-4 mt-2">
            <div className="rounded-lg border border-border/50 p-3 text-sm space-y-1.5">
              <div className="flex justify-between"><span className="text-muted-foreground">Enviado</span><span className="font-mono">{sent}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Defeitos registrados</span><span className="font-mono text-warning">{inspectionDefectQty}</span></div>
            </div>

            {!showDefectForm ? (
              <Button type="button" variant="outline" className="w-full gap-1.5" onClick={() => { setError(null); setShowDefectForm(true); }}>
                <Plus className="size-3.5" /> Registrar defeito
              </Button>
            ) : (
              <div className="space-y-3 rounded-lg border border-warning/30 bg-warning/5 p-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Quantidade</Label>
                    <Input className="input-field font-mono text-center" type="number" min="1"
                      value={countedDefect} onChange={(e) => setCountedDefect(e.target.value.replace(/\D/g, ""))} />
                  </div>
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
                <div className="space-y-1.5">
                  <Label>Descrição (opcional)</Label>
                  <Textarea className="input-field min-h-[50px]" value={defectDescription}
                    onChange={(e) => setDefectDescription(e.target.value)} placeholder="Ex.: costura solta…" />
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setShowDefectForm(false)}>Cancelar</Button>
                  <Button type="button" disabled={loading} className="flex-1" onClick={registerDefect}>{loading ? "..." : "Registrar"}</Button>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Peças boas conferidas</Label>
              <Input className="input-field font-mono text-center text-lg" type="number" min="0"
                value={countedOk} onChange={(e) => setCountedOk(e.target.value.replace(/\D/g, ""))} placeholder="0" />
              <p className="text-[11px] text-muted-foreground">
                Faltante = enviado − boas − defeito. O financeiro fecha ao finalizar.
              </p>
            </div>

            {error && <p role="alert" className="text-sm text-destructive text-center">{error}</p>}

            <Button type="button" disabled={loading || countedOk === ""} className="w-full" onClick={submitFinalize}>
              {loading ? "Finalizando..." : "Finalizar conferência"}
            </Button>
          </div>
        )}

        {/* RESULTADO */}
        {phase === "result" && result && (
          <div className="space-y-4 mt-2">
            {result.reconciliationStatus === "OK" && result.countedDefect === 0 ? (
              // Sem faltante E sem defeito: aí sim "tudo bate".
              <div className="flex flex-col items-center gap-2 rounded-lg bg-success/10 p-4 text-center">
                <CheckCircle2 className="size-8 text-success" />
                <p className="font-semibold text-success">Conferência concluída — tudo bate!</p>
              </div>
            ) : result.reconciliationStatus === "OK" ? (
              // Quantidade reconcilia (sem faltante), MAS há defeito: não dizer
              // "tudo bate" — deixar claro que passou defeito, com o valor retido.
              <div className="flex flex-col items-center gap-2 rounded-lg bg-warning/10 p-4 text-center">
                <AlertTriangle className="size-8 text-warning" />
                <p className="font-semibold text-warning">
                  Conferência concluída — {result.countedOk} boas, {result.countedDefect} com defeito
                </p>
                <p className="text-sm text-muted-foreground">Valor das defeituosas retido até resolução.</p>
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
              <div className="grid grid-cols-2 px-3 py-2"><span>Boas</span><span className="text-right font-mono">{result.countedOk}</span></div>
              <div className="grid grid-cols-2 px-3 py-2"><span>Defeito</span><span className="text-right font-mono">{result.countedDefect}</span></div>
              {result.shortageQty > 0 && (
                <div className="grid grid-cols-2 px-3 py-2 text-destructive"><span>Faltante</span><span className="text-right font-mono font-semibold">{result.shortageQty}</span></div>
              )}
            </div>
            <Button onClick={finish} className="w-full">Concluir</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export { ShipmentReceive };

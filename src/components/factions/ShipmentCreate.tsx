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
  color?: string | null;
  op_code?: string;
}

/** Chip que sinaliza a cor do lote (sublote de fracionamento). */
function ColorChip({ color }: { color?: string | null }) {
  if (!color) return null;
  return (
    <span className="ml-2 inline-flex items-center rounded-full border border-border/60 bg-secondary/40 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      {color}
    </span>
  );
}

function ShipmentCreate({ open, onOpenChange, factionId, onSuccess }: ShipmentCreateProps) {
  const [lots, setLots] = React.useState<Lot[]>([]);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [expectedReturn, setExpectedReturn] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [step, setStep] = React.useState<"select" | "confirm">("select");
  // Frente 1: agrupar os lotes num código compartilhado (default) ou um por lote.
  const [grouped, setGrouped] = React.useState(true);
  // Frente 2: preço por peça da remessa. Pré-preenchido pela sugestão do cadastro.
  const [priceInput, setPriceInput] = React.useState("");
  const [suggestedPrice, setSuggestedPrice] = React.useState<number | null>(null);
  const [barcode, setBarcode] = React.useState("");
  const [addingBarcode, setAddingBarcode] = React.useState(false);
  const [recentId, setRecentId] = React.useState<string | null>(null);
  const recentTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Realça por ~1.6s o lote recém-adicionado via código, para dar feedback visual.
  const flagRecent = React.useCallback((id: string) => {
    setRecentId(id);
    if (recentTimer.current) clearTimeout(recentTimer.current);
    recentTimer.current = setTimeout(() => setRecentId(null), 1600);
  }, []);

  React.useEffect(() => {
    return () => {
      if (recentTimer.current) clearTimeout(recentTimer.current);
    };
  }, []);

  React.useEffect(() => {
    if (open) {
      setSelectedIds(new Set());
      setExpectedReturn("");
      setNotes("");
      setBarcode("");
      setRecentId(null);
      setStep("select");
      setGrouped(true);
      setPriceInput("");
      setSuggestedPrice(null);
      // Fetch available lots
      fetch("/api/production/lots?available=true")
        .then((r) => r.json())
        .then((json) => setLots(json.data || []))
        .catch(() => setLots([]));
      // Frente 2: sugestão de preço vinda do cadastro da facção (pré-preenche o
      // campo, mas o admin sobrescreve por lote/grupo).
      fetch(`/api/factions/${factionId}`)
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((json) => {
          const price = Number(json?.data?.faction?.price_per_piece);
          if (Number.isFinite(price) && price > 0) {
            setSuggestedPrice(price);
            setPriceInput(String(price).replace(".", ","));
          }
        })
        .catch(() => setSuggestedPrice(null));
    }
  }, [open, factionId]);

  const toggleLot = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Colar código do lote/sublote (barcode) e atrelar à remessa. Aceita lotes que
  // não estão na lista "disponível" (ex.: sublotes de fracionamento por cor).
  const addByBarcode = async () => {
    const code = barcode.trim();
    if (!code || addingBarcode) return;
    setAddingBarcode(true);
    try {
      const res = await fetch(`/api/production/lots?barcode=${encodeURIComponent(code)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.data) {
        showToast("error", json.error || "Lote não encontrado");
        return;
      }
      const lot = json.data as Lot;
      if (selectedIds.has(lot.id)) {
        showToast("info", "Lote já adicionado");
      } else {
        setLots((prev) => (prev.some((l) => l.id === lot.id) ? prev : [lot, ...prev]));
        setSelectedIds((prev) => new Set(prev).add(lot.id));
        showToast("success", `Lote ${lot.code} adicionado`);
      }
      flagRecent(lot.id);
      setBarcode("");
    } catch {
      showToast("error", "Erro ao buscar lote");
    } finally {
      setAddingBarcode(false);
    }
  };

  const selectedLots = lots.filter((l) => selectedIds.has(l.id));
  const totalPieces = selectedLots.reduce((s, l) => s + l.quantity, 0);

  // Frente 2: preço digitado (aceita vírgula) → número. null = sem preço (cai no
  // fallback do cadastro no recebimento). Total a receber recalcula ao vivo.
  const parsedPrice = (() => {
    const n = Number(priceInput.replace(",", "."));
    return Number.isFinite(n) && n >= 0 && priceInput.trim() !== "" ? n : null;
  })();
  const totalReceber = parsedPrice != null ? parsedPrice * totalPieces : null;
  // Agrupar só é oferecido com 2+ lotes.
  const canGroup = selectedIds.size > 1;

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
          // Frente 1: agrupar só quando há 2+ lotes e o admin escolheu.
          grouped: canGroup && grouped,
          // Frente 2: preço por peça (omitido quando vazio → fallback no cadastro).
          ...(parsedPrice != null ? { pricePerPiece: parsedPrice } : {}),
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
            {/* Caminho 1: colar / escanear o código do lote ou sublote */}
            <div className="space-y-1.5">
              <Label htmlFor="lot-barcode">
                Colar ou escanear código do lote
              </Label>
              <div className="flex gap-2">
                <Input
                  id="lot-barcode"
                  aria-label="Código de barras do lote"
                  aria-describedby="lot-barcode-hint"
                  className="input-field flex-1 font-mono"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addByBarcode();
                    }
                  }}
                  placeholder="Ex.: LT-000123"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={addByBarcode}
                  disabled={addingBarcode || !barcode.trim()}
                >
                  {addingBarcode ? "..." : "Adicionar"}
                </Button>
              </div>
              <p id="lot-barcode-hint" className="text-[11px] text-muted-foreground/70">
                Aceita sublotes de fracionamento por cor. Também dá para marcar na lista abaixo.
              </p>
            </div>

            {/* Separador entre os dois caminhos */}
            <div className="flex items-center gap-3" aria-hidden="true">
              <span className="h-px flex-1 bg-border/60" />
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">ou</span>
              <span className="h-px flex-1 bg-border/60" />
            </div>

            {/* Caminho 2: escolher da lista de lotes disponíveis */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Lotes disponíveis
              </span>
              {lots.length > 0 && (
                <span className="text-[11px] text-muted-foreground/70">{lots.length} lote{lots.length !== 1 ? "s" : ""}</span>
              )}
            </div>

            {lots.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum lote disponível — cole um código acima para adicionar
              </p>
            ) : (
              <div className="max-h-[300px] overflow-y-auto space-y-1" role="group" aria-label="Lotes disponíveis">
                {lots.map((lot) => {
                  const isRecent = lot.id === recentId;
                  return (
                    <label
                      key={lot.id}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                        isRecent
                          ? "bg-foreground/10 ring-1 ring-foreground/30"
                          : "hover:bg-secondary/30"
                      }`}
                    >
                      <Checkbox
                        checked={selectedIds.has(lot.id)}
                        onCheckedChange={() => toggleLot(lot.id)}
                        aria-label={`Selecionar lote ${lot.code}`}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="font-mono text-sm">{lot.code}</span>
                        <ColorChip color={lot.color} />
                        {lot.op_code && (
                          <span className="text-xs text-muted-foreground ml-2">OP: {lot.op_code}</span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground font-mono shrink-0">
                        {lot.quantity} pçs
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="expected-return">Prazo de devolução</Label>
              <Input
                id="expected-return"
                className="input-field"
                type="date"
                value={expectedReturn}
                onChange={(e) => setExpectedReturn(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="shipment-notes">Motorista / Observações</Label>
              <Input
                id="shipment-notes"
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
                <div key={lot.id} className="flex justify-between items-center text-xs px-2 py-1 bg-secondary/10 rounded">
                  <span className="font-mono flex items-center">
                    {lot.code}
                    <ColorChip color={lot.color} />
                  </span>
                  <span className="text-muted-foreground shrink-0">{lot.quantity} pçs</span>
                </div>
              ))}
            </div>

            {/* Frente 1: como a facção acessa (só com 2+ lotes) */}
            {canGroup && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-primary/80">
                  Como a facção acessa
                </p>
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name="grouping"
                    className="mt-1 accent-primary"
                    checked={grouped}
                    onChange={() => setGrouped(true)}
                  />
                  <span className="text-[13px]">
                    Um código compartilhado
                    <span className="text-muted-foreground"> — a facção vê 1 card com os {selectedIds.size} lotes</span>
                  </span>
                </label>
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name="grouping"
                    className="mt-1 accent-primary"
                    checked={!grouped}
                    onChange={() => setGrouped(false)}
                  />
                  <span className="text-[13px] text-muted-foreground">
                    Um código por lote — {selectedIds.size} códigos separados
                  </span>
                </label>
              </div>
            )}

            {/* Frente 2: preço por peça + total a receber */}
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="price-per-piece">Preço por peça</Label>
                <div className="flex items-center gap-2 input-field h-10 px-3">
                  <span className="text-sm text-muted-foreground">R$</span>
                  <input
                    id="price-per-piece"
                    inputMode="decimal"
                    className="flex-1 bg-transparent outline-none font-mono text-sm"
                    value={priceInput}
                    onChange={(e) => setPriceInput(e.target.value.replace(/[^\d.,]/g, ""))}
                    placeholder="0,00"
                  />
                </div>
                {suggestedPrice != null && (
                  <p className="text-[11px] text-muted-foreground">
                    Sugerido do cadastro: R$ {suggestedPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} — sobrescreva por lote.
                  </p>
                )}
              </div>
              <div className="text-right pb-1.5 min-w-[120px]">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">A receber</p>
                <p className="font-mono text-xl font-semibold">
                  {totalReceber != null
                    ? `R$ ${totalReceber.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                    : "—"}
                </p>
                {totalReceber != null && (
                  <p className="text-[11px] text-muted-foreground">
                    {totalPieces} pçs × R$ {parsedPrice!.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("select")} className="flex-1">
                Voltar
              </Button>
              <Button onClick={handleSubmit} disabled={loading} className="flex-1">
                {loading ? "Enviando..." : canGroup && grouped ? "Gerar token e enviar" : "Enviar Remessa"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export { ShipmentCreate };

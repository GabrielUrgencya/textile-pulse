"use client";

import * as React from "react";
import { motion } from "motion/react";
import { X, Plus, Trash2, Loader2, Scissors } from "lucide-react";
import { LisionCard } from "@/components/ui/lision-card";
import { showToast } from "@/lib/toast";

interface SplitPart {
  quantity: string;
  label: string;
}

interface SplitLotModalProps {
  lotId: string;
  lotNumber: string;
  lotQuantity: number;
  onClose: () => void;
  onSplit: () => void;
}

/** Story 8.15 — Modal de fracionamento manual de lote */
function SplitLotModal({
  lotId,
  lotNumber,
  lotQuantity,
  onClose,
  onSplit,
}: SplitLotModalProps) {
  const [parts, setParts] = React.useState<SplitPart[]>([
    { quantity: "", label: "" },
  ]);
  const [saving, setSaving] = React.useState(false);

  const sum = parts.reduce((acc, p) => acc + (parseInt(p.quantity) || 0), 0);
  const remainder = lotQuantity - sum;
  const valid = sum > 0 && sum <= lotQuantity && parts.every((p) => (parseInt(p.quantity) || 0) >= 1);

  function updatePart(i: number, key: keyof SplitPart, value: string) {
    setParts((prev) => prev.map((p, idx) => (idx === i ? { ...p, [key]: value } : p)));
  }

  function addPart() {
    setParts((prev) => [...prev, { quantity: "", label: "" }]);
  }

  function removePart(i: number) {
    setParts((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  async function handleSubmit() {
    if (!valid) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/production/lots/${lotId}/split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parts: parts.map((p) => ({
            quantity: parseInt(p.quantity),
            label: p.label.trim() || null,
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erro ao fracionar lote");
      }
      showToast("success", "Lote fracionado com sucesso");
      onSplit();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao fracionar lote");
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg"
      >
        <LisionCard>
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80 mb-1.5 font-medium flex items-center gap-1.5">
                <Scissors className="size-3" /> Fracionar Lote
              </div>
              <h3 className="text-[15px] font-semibold tracking-tight">
                {lotNumber} — {lotQuantity.toLocaleString("pt-BR")} peças
              </h3>
            </div>
            <button
              onClick={onClose}
              className="size-8 rounded-lg bg-secondary/60 border border-border/60 grid place-items-center hover:bg-secondary transition"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="space-y-2 max-h-[320px] overflow-y-auto mb-3">
            {parts.map((p, i) => (
              <div key={i} className="grid grid-cols-[110px_1fr_auto] gap-2 items-center">
                <input
                  type="number"
                  min={1}
                  className="input-field tabular-nums"
                  placeholder="Qtd"
                  value={p.quantity}
                  onChange={(e) => updatePart(i, "quantity", e.target.value)}
                  disabled={saving}
                />
                <input
                  className="input-field"
                  placeholder="Cor / tamanho / modelo (opcional)"
                  value={p.label}
                  onChange={(e) => updatePart(i, "label", e.target.value)}
                  disabled={saving}
                />
                <button
                  onClick={() => removePart(i)}
                  disabled={parts.length === 1 || saving}
                  className="p-2 rounded-md hover:bg-secondary text-destructive disabled:opacity-30"
                  title="Remover parte"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={addPart}
            disabled={saving}
            className="text-[12px] flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition mb-4"
          >
            <Plus className="size-3.5" /> Adicionar parte
          </button>

          {/* Resumo de conservação */}
          <div className="flex items-center justify-between text-[12px] py-2 px-3 rounded-lg bg-secondary/30 border border-border/40 mb-4">
            <span className="text-muted-foreground">
              Somado: <span className="font-mono tabular-nums text-foreground">{sum}</span> / {lotQuantity}
            </span>
            <span className={remainder < 0 ? "text-destructive" : "text-muted-foreground"}>
              Restante no lote-mãe:{" "}
              <span className="font-mono tabular-nums text-foreground">{remainder}</span>
            </span>
          </div>

          {remainder < 0 && (
            <p className="text-[11px] text-destructive mb-3">
              A soma das partes excede a quantidade do lote.
            </p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleSubmit}
              disabled={!valid || saving}
              className="flex-1 h-9 rounded-lg bg-foreground text-background text-[13px] font-medium hover:bg-foreground/90 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Scissors className="size-4" />}
              Fracionar
            </button>
            <button
              onClick={onClose}
              disabled={saving}
              className="h-9 px-4 rounded-lg bg-secondary/60 border border-border/60 text-[13px] font-medium hover:bg-secondary transition text-muted-foreground"
            >
              Cancelar
            </button>
          </div>
        </LisionCard>
      </motion.div>
    </motion.div>
  );
}

export { SplitLotModal };

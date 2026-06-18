"use client";

import * as React from "react";
import { motion } from "motion/react";
import { X, Loader2, Pencil } from "lucide-react";
import { LisionCard } from "@/components/ui/lision-card";
import { showToast } from "@/lib/toast";

interface EditLotModalProps {
  lotId: string;
  lotNumber: string;
  currentQuantity: number;
  currentDestination?: string | null;
  onClose: () => void;
  onSaved: () => void;
}

/** Story 8.19 — Edição manual de lote (quantidade / identificação) */
function EditLotModal({
  lotId,
  lotNumber,
  currentQuantity,
  currentDestination,
  onClose,
  onSaved,
}: EditLotModalProps) {
  const [quantity, setQuantity] = React.useState(String(currentQuantity));
  const [destination, setDestination] = React.useState(currentDestination ?? "");
  const [saving, setSaving] = React.useState(false);

  const qty = parseInt(quantity);
  const valid = !Number.isNaN(qty) && qty >= 1;

  async function handleSave() {
    if (!valid) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/production/lots/${lotId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: qty, destination: destination.trim() || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erro ao editar lote");
      }
      showToast("success", "Lote atualizado");
      onSaved();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao editar lote");
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
        className="w-full max-w-md"
      >
        <LisionCard>
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80 mb-1.5 font-medium flex items-center gap-1.5">
                <Pencil className="size-3" /> Editar Lote
              </div>
              <h3 className="text-[15px] font-semibold tracking-tight">{lotNumber}</h3>
            </div>
            <button
              onClick={onClose}
              className="size-8 rounded-lg bg-secondary/60 border border-border/60 grid place-items-center hover:bg-secondary transition"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1.5">
                Quantidade (peças)
              </label>
              <input
                type="number"
                min={1}
                className="input-field tabular-nums"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                disabled={saving}
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1.5">
                Identificação (cor / tamanho / modelo)
              </label>
              <input
                className="input-field"
                placeholder="Opcional"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                disabled={saving}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 mt-5">
            <button
              onClick={handleSave}
              disabled={!valid || saving}
              className="flex-1 h-9 rounded-lg bg-foreground text-background text-[13px] font-medium hover:bg-foreground/90 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Pencil className="size-4" />}
              Salvar
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

export { EditLotModal };

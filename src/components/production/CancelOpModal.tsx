"use client";

import * as React from "react";
import { motion } from "motion/react";
import { X, Loader2, AlertTriangle } from "lucide-react";
import { LisionCard } from "@/components/ui/lision-card";
import { showToast } from "@/lib/toast";

interface CancelOpModalProps {
  orderId: string;
  opNumber: string;
  onClose: () => void;
  onCancelled: () => void;
}

/** Story 8.16 — Modal de cancelamento/arquivamento de OP */
function CancelOpModal({ orderId, opNumber, onClose, onCancelled }: CancelOpModalProps) {
  const [confirmText, setConfirmText] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const confirmed = confirmText.trim() === opNumber;
  const valid = confirmed && reason.trim().length > 0;

  async function handleSubmit() {
    if (!valid) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/production/orders/${orderId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erro ao cancelar OP");
      }
      showToast("success", "OP cancelada");
      onCancelled();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao cancelar OP");
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
              <div className="text-[10px] uppercase tracking-[0.18em] text-destructive/80 mb-1.5 font-medium flex items-center gap-1.5">
                <AlertTriangle className="size-3" /> Cancelar OP
              </div>
              <h3 className="text-[15px] font-semibold tracking-tight">OP-{opNumber}</h3>
            </div>
            <button
              onClick={onClose}
              className="size-8 rounded-lg bg-secondary/60 border border-border/60 grid place-items-center hover:bg-secondary transition"
            >
              <X className="size-4" />
            </button>
          </div>

          <p className="text-[12px] text-muted-foreground mb-4">
            A OP será arquivada e sairá das listas operacionais, mas permanece no
            histórico para auditoria. Esta ação não apaga os dados.
          </p>

          <div className="space-y-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1.5">
                Digite <span className="font-mono text-foreground">{opNumber}</span> para confirmar
              </label>
              <input
                className="input-field font-mono"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={opNumber}
                disabled={saving}
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1.5">
                Motivo do cancelamento
              </label>
              <input
                className="input-field"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex: OP criada por engano"
                disabled={saving}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 mt-5">
            <button
              onClick={handleSubmit}
              disabled={!valid || saving}
              className="flex-1 h-9 rounded-lg bg-destructive text-white text-[13px] font-medium hover:bg-destructive/90 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <AlertTriangle className="size-4" />}
              Cancelar OP
            </button>
            <button
              onClick={onClose}
              disabled={saving}
              className="h-9 px-4 rounded-lg bg-secondary/60 border border-border/60 text-[13px] font-medium hover:bg-secondary transition text-muted-foreground"
            >
              Voltar
            </button>
          </div>
        </LisionCard>
      </motion.div>
    </motion.div>
  );
}

export { CancelOpModal };

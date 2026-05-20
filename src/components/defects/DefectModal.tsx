"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Loader2, AlertTriangle } from "lucide-react";

interface DefectModalProps {
  lotId: string;
  barcode: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const DEFECT_TYPES = [
  { value: "COSTURA", label: "Costura" },
  { value: "TECIDO", label: "Tecido" },
  { value: "AVIAMENTO", label: "Aviamento" },
  { value: "OUTRO", label: "Outro" },
] as const;

const SEVERITIES = [
  { value: "LEVE", label: "Leve" },
  { value: "MEDIO", label: "Médio" },
  { value: "GRAVE", label: "Grave" },
] as const;

export function DefectModal({ lotId, barcode, open, onClose, onSuccess }: DefectModalProps) {
  const [defectType, setDefectType] = useState("COSTURA");
  const [severity, setSeverity] = useState("MEDIO");
  const [quantity, setQuantity] = useState(1);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/defects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lot_id: lotId,
          defect_type: defectType,
          severity,
          quantity,
          description: description.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Erro ao registrar defeito");
        return;
      }

      // Reset form
      setDefectType("COSTURA");
      setSeverity("MEDIO");
      setQuantity(1);
      setDescription("");
      onSuccess();
    } catch {
      setError("Erro de conexão com o servidor");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-md rounded-2xl bg-card border border-border/60 shadow-elegant overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80 mb-1.5 font-medium">
                  Reportar Defeito
                </div>
                <h3 className="text-[15px] font-semibold tracking-tight">
                  Lote {barcode}
                </h3>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-secondary/50 transition-colors"
              >
                <X className="size-4 text-muted-foreground" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="px-5 pb-5 space-y-4">
              {/* Defect Type */}
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 block font-medium">
                  Tipo de Defeito
                </label>
                <select
                  value={defectType}
                  onChange={(e) => setDefectType(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg bg-secondary/30 border border-border/40 text-foreground text-[13px] focus:outline-none focus:ring-1 focus:ring-foreground/20 transition-colors"
                >
                  {DEFECT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Severity */}
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 block font-medium">
                  Severidade
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {SEVERITIES.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setSeverity(s.value)}
                      className={`px-3 py-2 rounded-lg text-[13px] font-medium transition-colors border ${
                        severity === s.value
                          ? s.value === "GRAVE"
                            ? "bg-destructive/10 text-destructive border-destructive/20"
                            : s.value === "MEDIO"
                              ? "bg-warning/10 text-warning border-warning/20"
                              : "bg-foreground text-background border-foreground/20"
                          : "border-border/40 hover:bg-secondary/50 text-muted-foreground"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quantity */}
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 block font-medium">
                  Quantidade Defeituosa
                </label>
                <input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-3 py-2.5 rounded-lg bg-secondary/30 border border-border/40 text-foreground font-mono text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-foreground/20 transition-colors"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 block font-medium">
                  Observação
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descreva o defeito encontrado..."
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-lg bg-secondary/30 border border-border/40 text-foreground text-[13px] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground/20 transition-colors resize-none"
                />
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 text-[13px] text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                  <AlertTriangle className="size-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 rounded-lg bg-destructive text-white font-medium text-[13px] hover:bg-destructive/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Registrando...
                  </>
                ) : (
                  <>
                    <AlertTriangle className="size-4" />
                    Reportar Defeito
                  </>
                )}
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

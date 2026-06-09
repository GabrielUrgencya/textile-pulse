"use client";

import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

export type AduanaColor = "GREEN" | "AMBER" | "RED" | null;

interface AduanaColorFeedbackProps {
  color: AduanaColor;
  reason: string;
  lotBarcode?: string;
  onDismiss: () => void;
  onProceed?: () => void;
  onSeparate?: () => void;
}

const CONFIG = {
  GREEN: {
    bg: "bg-green-500/20",
    border: "border-green-500",
    text: "text-green-400",
    icon: CheckCircle2,
  },
  AMBER: {
    bg: "bg-amber-500/20",
    border: "border-amber-500",
    text: "text-amber-400",
    icon: AlertTriangle,
  },
  RED: {
    bg: "bg-red-500/20",
    border: "border-red-500",
    text: "text-red-400",
    icon: XCircle,
  },
};

export function AduanaColorFeedback({
  color,
  reason,
  lotBarcode,
  onDismiss,
  onProceed,
  onSeparate,
}: AduanaColorFeedbackProps) {
  return (
    <AnimatePresence>
      {color && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className={`flex flex-col items-center justify-center gap-6 rounded-2xl border-2 p-8 ${CONFIG[color].bg} ${CONFIG[color].border}`}
          style={{ minHeight: "60vh" }}
        >
          {(() => {
            const Icon = CONFIG[color].icon;
            return <Icon className={`h-[120px] w-[120px] ${CONFIG[color].text}`} />;
          })()}

          {lotBarcode && (
            <p className="font-mono text-2xl text-foreground">{lotBarcode}</p>
          )}

          <p className={`text-center text-xl font-bold ${CONFIG[color].text}`}>
            {reason}
          </p>

          <div className="flex gap-3">
            {color === "AMBER" && onProceed && (
              <button
                onClick={onProceed}
                className="rounded-lg bg-amber-600 px-6 py-3 text-sm font-medium text-white hover:bg-amber-700"
              >
                Prosseguir
              </button>
            )}
            {color === "AMBER" && onSeparate && (
              <button
                onClick={onSeparate}
                className="rounded-lg border border-amber-500 px-6 py-3 text-sm font-medium text-amber-400 hover:bg-amber-500/10"
              >
                Separar
              </button>
            )}
            <button
              onClick={onDismiss}
              className="rounded-lg border border-muted-foreground/30 px-6 py-3 text-sm font-medium text-muted-foreground hover:bg-muted/20"
            >
              {color === "GREEN" ? "Próximo" : "Fechar"}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

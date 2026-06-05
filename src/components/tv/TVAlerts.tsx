"use client";

import { motion } from "motion/react";
import { CheckCircle2 } from "lucide-react";
import { LisionCard, LisionCardHeader } from "@/components/ui/lision-card";

const EASE = [0.22, 1, 0.36, 1] as const;

interface AlertData {
  type: "stale_lot" | "overdue_shipment";
  severity: "critical" | "warning";
  barcode?: string;
  op_number?: string;
  stage_name?: string;
  hours_stalled?: number;
  faction_name?: string;
  expected_return_at?: string;
  days_overdue?: number;
}

interface TVAlertsProps {
  alerts: AlertData[];
}

function formatHours(h: number): string {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  if (hrs === 0) return `${mins}min`;
  return `${hrs}h${mins > 0 ? `${mins}min` : ""}`;
}

export function TVAlerts({ alerts }: TVAlertsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.3, ease: EASE }}
      className="h-full"
    >
      <LisionCard className="h-full flex flex-col">
        {/* Labels — spec lines 296-297: eyebrow "Operação", title "Ação Necessária" */}
        <LisionCardHeader
          eyebrow="Operação"
          title="Ação Necessária"
          right={
            alerts.length > 0 ? (
              <span className="text-[12px] text-muted-foreground/60">
                {alerts.length} {alerts.length === 1 ? "alerta" : "alertas"}
              </span>
            ) : undefined
          }
        />

        {alerts.length === 0 ? (
          /* Empty state — spec lines 349-351 */
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-8">
            <CheckCircle2 className="size-10 text-success/30" />
            <span className="text-[14px] text-muted-foreground">
              Nenhum alerta ativo
            </span>
            <span className="text-[12px] text-muted-foreground/60 -mt-1">
              Produção fluindo normalmente
            </span>
          </div>
        ) : (
          /* Alert items — spec lines 342-347 */
          <div className="space-y-3 flex-1">
            {alerts.map((alert, i) => (
              <motion.div
                key={`${alert.type}-${alert.barcode || alert.faction_name}-${i}`}
                className={`flex items-start gap-3 p-3.5 rounded-xl border ${
                  alert.severity === "critical"
                    ? "border-destructive/30 bg-destructive/5"
                    : "border-warning/30 bg-warning/5"
                }`}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.5 + 0.1 * i, ease: EASE }}
              >
                {/* Dots — spec lines 344-345 */}
                {alert.severity === "critical" ? (
                  <span className="size-2 rounded-full bg-destructive animate-pulse-dot mt-1.5 shrink-0" />
                ) : (
                  <span className="size-2 rounded-full bg-warning mt-1.5 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  {alert.type === "stale_lot" ? (
                    <>
                      {/* Text — spec line 346: text-[14px] */}
                      <div className="text-[14px] font-medium truncate">
                        {alert.barcode}{" "}
                        <span className="text-muted-foreground/60">
                          parado em {alert.stage_name}
                        </span>
                      </div>
                      <div className="font-mono text-[12px] tabular-nums text-muted-foreground mt-1">
                        há {formatHours(alert.hours_stalled ?? 0)} — {alert.op_number}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-[14px] font-medium truncate">
                        Facção &quot;{alert.faction_name}&quot; atrasada
                      </div>
                      <div className="font-mono text-[12px] tabular-nums text-muted-foreground mt-1">
                        {alert.days_overdue}d de atraso no retorno
                      </div>
                    </>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </LisionCard>
    </motion.div>
  );
}

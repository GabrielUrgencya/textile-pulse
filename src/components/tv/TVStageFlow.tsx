"use client";

import { motion } from "motion/react";
import { LisionCard, LisionCardHeader } from "@/components/ui/lision-card";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Fix known encoding issues in stage display names */
function fixStageName(name: string): string {
  return name
    .replace(/Produ[^\w\s]*o\s*\/\s*Fac[^\w\s]*o/i, "Produção / Facção")
    .replace(/Confer[^\w\s]*ncia/i, "Conferência");
}

interface StageData {
  stage_name: string;
  display_name: string;
  count: number;
  order_index: number;
  color: string;
}

interface TVStageFlowProps {
  stages: StageData[];
}

export function TVStageFlow({ stages }: TVStageFlowProps) {
  const sorted = [...stages].sort((a, b) => a.order_index - b.order_index);
  const maxCount = Math.max(...sorted.map((s) => s.count), 1);
  const totalLots = sorted.reduce((sum, s) => sum + s.count, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2, ease: EASE }}
      className="h-full"
    >
      <LisionCard className="h-full flex flex-col">
        <LisionCardHeader
          eyebrow="Fluxo"
          title="Lotes por Etapa"
          right={
            <span className="font-mono text-[14px] tabular-nums text-muted-foreground/60">
              {totalLots} lotes
            </span>
          }
        />

        {/* Proportional blocks — width relative to count */}
        <div className="flex-1 flex flex-col justify-center gap-4">
          <div className="flex gap-1.5 items-end" style={{ minHeight: 100 }}>
            {sorted.map((stage, i) => {
              const widthPct =
                totalLots > 0
                  ? Math.max((stage.count / totalLots) * 100, 6)
                  : 100 / sorted.length;
              const heightPct =
                maxCount > 0
                  ? Math.max((stage.count / maxCount) * 100, 20)
                  : 20;
              const isBottleneck =
                stage.count === maxCount && stage.count > 0;
              const displayName = fixStageName(stage.display_name);

              return (
                <motion.div
                  key={stage.stage_name}
                  className={`rounded-lg flex flex-col items-center justify-end relative overflow-hidden ${
                    isBottleneck
                      ? "bg-foreground text-background"
                      : "bg-secondary/30 text-foreground"
                  }`}
                  style={{
                    width: `${widthPct}%`,
                    height: `${heightPct}%`,
                    minWidth: 48,
                    minHeight: 56,
                  }}
                  initial={{ opacity: 0, scaleY: 0 }}
                  animate={{ opacity: stage.count > 0 ? 1 : 0.35, scaleY: 1 }}
                  transition={{
                    duration: 0.5,
                    delay: 0.15 + i * 0.06,
                    ease: EASE,
                  }}
                >
                  <span className="font-display text-[22px] font-semibold tabular-nums leading-none mb-0.5">
                    {stage.count}
                  </span>
                  <span
                    className={`text-[8px] uppercase tracking-wider truncate w-full text-center px-1 mb-2 ${
                      isBottleneck
                        ? "text-background/60"
                        : "text-muted-foreground/50"
                    }`}
                  >
                    {displayName}
                  </span>
                  {isBottleneck && (
                    <>
                      <div className="absolute inset-0 animate-shimmer pointer-events-none" />
                      <div className="absolute -top-px left-1/2 -translate-x-1/2 text-[7px] uppercase tracking-wider bg-background text-foreground px-1.5 py-0.5 rounded-b font-medium whitespace-nowrap">
                        gargalo
                      </div>
                    </>
                  )}
                </motion.div>
              );
            })}
          </div>

          {/* Stage legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 px-1">
            {sorted.map((stage) => {
              const displayName = fixStageName(stage.display_name);
              const isBottleneck =
                stage.count === maxCount && stage.count > 0;
              return (
                <div
                  key={stage.stage_name}
                  className="flex items-center gap-1.5"
                >
                  <span
                    className={`size-1.5 rounded-full ${
                      isBottleneck
                        ? "bg-foreground"
                        : "bg-muted-foreground/30"
                    }`}
                  />
                  <span className="text-[10px] text-muted-foreground/50">
                    {displayName}
                  </span>
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground/35">
                    {stage.count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </LisionCard>
    </motion.div>
  );
}

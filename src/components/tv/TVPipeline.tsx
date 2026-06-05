"use client";

import { motion } from "motion/react";
import { LisionCard, LisionCardHeader } from "@/components/ui/lision-card";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Fallback map for stage names with corrupted UTF-8 encoding from the database */
const STAGE_NAME_FIXES: Record<string, string> = {
  "Produ\uFFFDo / Fac\uFFFDo": "Produção / Facção",
  "Confer\uFFFDncia": "Conferência",
};

/** Fix known encoding issues in stage display names */
function fixStageName(name: string): string {
  // Check direct match first
  if (STAGE_NAME_FIXES[name]) return STAGE_NAME_FIXES[name];
  // Check for common garbled patterns (replacement chars, tildes, etc.)
  const cleaned = name
    .replace(/Produ[^\w\s]*o\s*\/\s*Fac[^\w\s]*o/i, "Produção / Facção")
    .replace(/Confer[^\w\s]*ncia/i, "Conferência");
  return cleaned;
}

interface StageData {
  stage_name: string;
  display_name: string;
  count: number;
  order_index: number;
  color: string;
}

interface TVPipelineProps {
  stages: StageData[];
}

export function TVPipeline({ stages }: TVPipelineProps) {
  const maxCount = Math.max(...stages.map((s) => s.count), 1);
  const totalLots = stages.reduce((sum, s) => sum + s.count, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2, ease: EASE }}
      className="h-full"
    >
      <LisionCard className="h-full flex flex-col">
        <LisionCardHeader
          eyebrow="Distribuição"
          title="Pipeline de Etapas"
          right={
            <span className="font-mono text-[16px] tabular-nums text-muted-foreground/70">
              {totalLots} lotes
            </span>
          }
        />

        <div className="space-y-2 flex-1 flex flex-col justify-evenly">
          {stages.map((stage, i) => {
            const widthPercent =
              maxCount > 0 ? Math.max((stage.count / maxCount) * 100, 2) : 2;
            const isBottleneck = stage.count === maxCount && stage.count > 0;
            const displayName = fixStageName(stage.display_name);

            return (
              <motion.div
                key={stage.stage_name}
                className="flex items-center gap-3"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  duration: 0.4,
                  delay: 0.05 * i,
                  ease: EASE,
                }}
              >
                <span className="text-[13px] font-medium w-36 text-right text-muted-foreground/90 leading-tight truncate">
                  {displayName}
                </span>
                <div className="flex-1 h-7 relative rounded-md overflow-hidden bg-secondary/20">
                  <motion.div
                    className={`absolute inset-y-0 left-0 rounded-md ${isBottleneck ? "bg-foreground" : ""}`}
                    style={!isBottleneck ? { background: "linear-gradient(90deg, oklch(0.98 0 0 / 0.8), oklch(0.98 0 0 / 0.2))" } : undefined}
                    initial={{ width: 0 }}
                    animate={{ width: `${widthPercent}%` }}
                    transition={{
                      duration: 0.8,
                      delay: 0.08 * i,
                      ease: EASE,
                    }}
                  />
                  {isBottleneck && (
                    <div
                      className="absolute inset-y-0 left-0 animate-shimmer rounded-md pointer-events-none"
                      style={{ width: `${widthPercent}%` }}
                    />
                  )}
                </div>
                <span className="font-mono text-[16px] tabular-nums font-semibold w-10 text-right">
                  {stage.count}
                </span>
              </motion.div>
            );
          })}
        </div>
      </LisionCard>
    </motion.div>
  );
}

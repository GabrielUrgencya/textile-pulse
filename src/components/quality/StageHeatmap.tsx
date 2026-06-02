"use client";

import { Grid3x3 } from "lucide-react";
import { LisionCard, LisionCardHeader } from "@/components/ui/lision-card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import type { StageHeatmapData } from "@/hooks/use-quality-data";

interface StageHeatmapProps {
  data: StageHeatmapData | null;
  loading: boolean;
}

function StageHeatmap({ data, loading }: StageHeatmapProps) {
  if (loading) {
    return (
      <LisionCard>
        <LisionCardHeader eyebrow="Distribuição" title="Heatmap Etapa × Defeito" />
        <div className="p-4">
          <Skeleton className="h-[200px] w-full rounded-lg" />
        </div>
      </LisionCard>
    );
  }

  if (!data || data.stages.length === 0 || data.defect_types.length === 0) {
    return (
      <LisionCard>
        <LisionCardHeader eyebrow="Distribuição" title="Heatmap Etapa × Defeito" />
        <EmptyState
          icon={Grid3x3}
          title="Sem dados para heatmap"
          description="Nenhum dado cruzado etapa/defeito no período"
        />
      </LisionCard>
    );
  }

  // Find max count for normalization
  let maxCount = 0;
  for (const stage of data.stages) {
    for (const type of data.defect_types) {
      const count = stage.types[type] || 0;
      if (count > maxCount) maxCount = count;
    }
  }

  return (
    <LisionCard>
      <LisionCardHeader eyebrow="Distribuição" title="Heatmap Etapa × Defeito" />
      <div className="p-4 overflow-x-auto">
        <div className="min-w-[500px]">
          {/* Header row */}
          <div
            className="grid gap-1 mb-1"
            style={{
              gridTemplateColumns: `120px repeat(${data.defect_types.length}, 1fr)`,
            }}
          >
            <div />
            {data.defect_types.map((type) => (
              <div
                key={type}
                className="text-[9px] text-muted-foreground text-center truncate px-1"
                title={type}
              >
                {type}
              </div>
            ))}
          </div>

          {/* Data rows */}
          {data.stages.map((stage) => (
            <div
              key={stage.stage}
              className="grid gap-1 mb-1"
              style={{
                gridTemplateColumns: `120px repeat(${data.defect_types.length}, 1fr)`,
              }}
            >
              <div className="text-xs text-muted-foreground truncate pr-2 flex items-center">
                {stage.stage}
              </div>
              {data.defect_types.map((type) => {
                const count = stage.types[type] || 0;
                const opacity = maxCount > 0 ? Math.max(0.05, count / maxCount) : 0;
                return (
                  <div
                    key={type}
                    className="rounded h-8 flex items-center justify-center text-[10px] font-mono cursor-default transition-opacity"
                    style={{
                      backgroundColor: `oklch(0.55 0.2 25 / ${opacity})`,
                    }}
                    title={`${stage.stage} — ${type}: ${count}`}
                  >
                    {count > 0 ? count : ""}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Mobile scroll indicator */}
        <div className="md:hidden text-center mt-2">
          <span className="text-[10px] text-muted-foreground">← Deslize para ver mais →</span>
        </div>
      </div>
    </LisionCard>
  );
}

export { StageHeatmap };

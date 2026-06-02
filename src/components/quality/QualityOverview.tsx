"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { MetricBox } from "@/components/ui/metric-box";
import { Skeleton } from "@/components/ui/skeleton";
import type { QualityOverview as OverviewData } from "@/hooks/use-quality-data";

interface QualityOverviewProps {
  data: OverviewData | null;
  loading: boolean;
}

function TrendIcon({ value }: { value: number }) {
  if (value > 0) return <TrendingUp className="size-3 text-destructive" />;
  if (value < 0) return <TrendingDown className="size-3 text-success" />;
  return <Minus className="size-3 text-muted-foreground" />;
}

function QualityOverview({ data, loading }: QualityOverviewProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border/40 bg-secondary/30 p-3 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <MetricBox label="Total Defeitos" value={String(data.total)}>
        <div className="flex items-center gap-1 mt-1">
          <TrendIcon value={data.trends.total} />
          <span className="text-[10px] text-muted-foreground">
            {data.trends.total > 0 ? "+" : ""}
            {data.trends.total}
          </span>
        </div>
      </MetricBox>

      <MetricBox
        label="Taxa de Defeito"
        value={`${data.total > 0 ? ((data.total / Math.max(data.total + data.resolved, 1)) * 100).toFixed(1) : "0.0"}%`}
      />

      <MetricBox label="Defeitos Críticos" value={String(data.critical)} accent={data.critical > 0}>
        <div className="flex items-center gap-1 mt-1">
          <TrendIcon value={data.trends.critical} />
          <span className="text-[10px] text-muted-foreground/70">
            {data.trends.critical > 0 ? "+" : ""}
            {data.trends.critical}
          </span>
        </div>
      </MetricBox>

      <MetricBox label="Taxa Resolução" value={`${data.resolutionRate}%`}>
        <div className="flex items-center gap-1 mt-1">
          <TrendIcon value={data.trends.resolutionRate} />
          <span className="text-[10px] text-muted-foreground">
            {data.trends.resolutionRate > 0 ? "+" : ""}
            {data.trends.resolutionRate}%
          </span>
        </div>
      </MetricBox>
    </div>
  );
}

export { QualityOverview };

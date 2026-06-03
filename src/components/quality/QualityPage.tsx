"use client";

import * as React from "react";
import { PageHeader } from "@/components/ui/page-header";
import { DateRangeFilter, type DateRange } from "@/components/ui/date-range-filter";
import { QualityOverview } from "@/components/quality/QualityOverview";
import { DefectPareto } from "@/components/quality/DefectPareto";
import { DefectTrend } from "@/components/quality/DefectTrend";
import { StageHeatmap } from "@/components/quality/StageHeatmap";
import { FactionQuality } from "@/components/quality/FactionQuality";
import {
  useQualityOverview,
  useDefectsByType,
  useStageHeatmap,
  useDefectTrend,
  useFactionQuality,
} from "@/hooks/use-quality-data";

function QualityPage({ canViewFactions }: { canViewFactions: boolean }) {
  const [range, setRange] = React.useState<DateRange>(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 30);
    return { from, to };
  });

  const overview = useQualityOverview(range);
  const byType = useDefectsByType(range);
  const heatmap = useStageHeatmap(range);
  const trend = useDefectTrend(range);
  const factionQuality = useFactionQuality(range);

  return (
    <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-6 lg:py-8">
      <PageHeader eyebrow="Qualidade" title="Análise de Defeitos">
        <DateRangeFilter value={range} onChange={setRange} />
      </PageHeader>

      <div className="space-y-6">
        {/* Section 1: KPI Row */}
        <QualityOverview data={overview.data} loading={overview.isLoading} />

        {/* Section 2: Pareto */}
        <DefectPareto data={byType.data} loading={byType.isLoading} />

        {/* Section 3: Trend */}
        <DefectTrend data={trend.data} loading={trend.isLoading} />

        {/* Section 4: Heatmap */}
        <StageHeatmap data={heatmap.data} loading={heatmap.isLoading} />

        {/* Section 5: Faction Quality (permission gated) */}
        {canViewFactions && (
          <FactionQuality data={factionQuality.data} loading={factionQuality.isLoading} />
        )}
      </div>
    </div>
  );
}

export { QualityPage };

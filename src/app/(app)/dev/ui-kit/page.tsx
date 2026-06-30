"use client";

import { PageHeader } from "@/components/ui/page-header";
import { BentoGrid, BentoCell } from "@/components/ui/bento-grid";
import { KpiCard, KpiLabel, KpiValue, KpiDelta, KpiSupport } from "@/components/ui/kpi-card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { CountUp } from "@/components/ui/count-up";
import { AreaChartCard } from "@/components/ui/area-chart-card";
import { Skeleton, EmptyState, ErrorState } from "@/components/ui/data-states";

/**
 * Story 8.39 — Showcase dev-only dos primitives das Dashboards 2.0.
 * Validação visual rápida (não é rota de produto).
 */

const SERIES = [
  { label: "08h", value: 12 }, { label: "09h", value: 28 }, { label: "10h", value: 41 },
  { label: "11h", value: 35 }, { label: "12h", value: 22 }, { label: "13h", value: 38 },
  { label: "14h", value: 52 }, { label: "15h", value: 47 },
];

export default function UiKitPage() {
  return (
    <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-6 lg:py-8">
      <PageHeader eyebrow="Dev" title="UI Kit — Dashboards 2.0" />

      <BentoGrid className="mt-6">
        <BentoCell size="lg">
          <KpiCard highlight index={0} className="h-full flex flex-col justify-between">
            <KpiLabel>Meta do Momento</KpiLabel>
            <div>
              <KpiValue><CountUp value={1240} /></KpiValue>
              <KpiSupport>/ 1.500 peças</KpiSupport>
            </div>
            <ProgressBar value={1240} max={1500} glow thresholds={{ warning: 70, critical: 40 }} />
          </KpiCard>
        </BentoCell>

        <BentoCell size="md">
          <KpiCard index={1} className="h-full flex flex-col justify-between">
            <KpiLabel>Lotes Bipados</KpiLabel>
            <KpiValue><CountUp value={86} /></KpiValue>
            <KpiDelta value={12} suffix=" vs ontem" />
          </KpiCard>
        </BentoCell>

        <BentoCell size="md">
          <AreaChartCard label="Produção por hora" data={SERIES} index={2} />
        </BentoCell>

        <BentoCell size="sm">
          <KpiCard index={3} className="h-full"><KpiLabel>Skeleton</KpiLabel><Skeleton className="h-16 mt-3" /></KpiCard>
        </BentoCell>
        <BentoCell size="sm">
          <KpiCard index={4} className="h-full"><EmptyState title="Sem dados" description="Nada por aqui ainda." /></KpiCard>
        </BentoCell>
        <BentoCell size="sm">
          <KpiCard index={5} className="h-full"><ErrorState description="Falha simulada." onRetry={() => {}} /></KpiCard>
        </BentoCell>
      </BentoGrid>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import {
  MetaDailyCard,
  PercentCard,
  PeriodGoalCard,
  PlanCard,
  HistoryCard,
  type MetaData,
  type Plan,
  type HistoryPoint,
} from "@/components/meu-plano/sections";

/**
 * PREVIEW DEV-ONLY do módulo Meu Plano (loop visual da @ux).
 * Renderiza os mesmos componentes da rota real com dados mockados —
 * a rota real exige login; esta permite screenshot sem credenciais.
 * Em produção: 404.
 */

const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const MOCK_META: MetaData = {
  stage_name: "Corte",
  target: 2200,
  unit: "peças",
  progress: 1480,
  percent: 67.3,
  weekly: { target: 500, progress: 320, estimated: true },
  monthly: { target: 2300, progress: 1900, estimated: true },
  elapsed_since_first_scan_min: 312,
  avg_per_lot_min: 14.5,
  completed: false,
  deficits: { daily: 2100, weekly: 0, monthly: 0 },
};

const MOCK_PLANS: Plan[] = [
  {
    id: "p1",
    plan_date: TODAY,
    name: "Linha Premium",
    meta: 2200,
    items: [
      { id: "i1", reference: "REF-1042", color: "Preto", size_label: "P–GG", quantity: 900 },
      { id: "i2", reference: "REF-1043", color: "Off-white", size_label: "M–G", quantity: 800 },
      { id: "i3", reference: "REF-0977", color: "Marinho", size_label: "Único", quantity: 500 },
    ],
  },
  { id: "p2", plan_date: addDays(TODAY, -1), name: null, meta: 2000, items: [] },
  { id: "p3", plan_date: addDays(TODAY, 1), name: null, meta: 1800, items: [] },
];

const MOCK_PRODUCED_BY_DAY: Record<string, number> = {};
const MOCK_HISTORY: HistoryPoint[] = [];
for (let i = 29; i >= 0; i--) {
  const d = addDays(TODAY, -i);
  const dow = new Date(`${d}T12:00:00.000Z`).getUTCDay();
  const isWeekend = dow === 0 || dow === 6;
  // Mistura de dias verdes (bateu) e vermelhos (déficit) para o loop visual
  const produced = isWeekend ? 0 : Math.round(1400 + Math.sin(i * 1.7) * 700 + (i % 5 === 0 ? 900 : 0));
  MOCK_PRODUCED_BY_DAY[d] = produced;
  MOCK_HISTORY.push({ date: d, produced, target: isWeekend ? null : 2000 });
}
MOCK_PRODUCED_BY_DAY[addDays(TODAY, -1)] = 2350; // ontem: plano concluído (semana com dot verde)

export default function MeuPlanoPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return <PreviewContent />;
}

function PreviewContent() {
  const [planView, setPlanView] = useState<"today" | "week" | "month">("today");
  const [histDays, setHistDays] = useState<7 | 30>(7);
  const todayPlans = useMemo(() => MOCK_PLANS.filter((p) => p.plan_date === TODAY), []);

  return (
    <div className="relative min-h-screen bg-background p-6 text-foreground lg:p-10">
      <div className="fixed inset-0 bg-grid opacity-30 pointer-events-none" aria-hidden />
      <div className="relative mx-auto max-w-[1400px] space-y-6">
        <PageHeader eyebrow="Produção individual · PREVIEW" title="Meu Plano" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <MetaDailyCard meta={MOCK_META} unit="peças" />
          <PercentCard meta={MOCK_META} />
          <PeriodGoalCard label="Semana" kpi={MOCK_META.weekly} unit="peças" />
          <PeriodGoalCard label="Mês" kpi={MOCK_META.monthly} unit="peças" />
          <PlanCard
            view={planView}
            onViewChange={setPlanView}
            todayPlans={todayPlans}
            allPlans={MOCK_PLANS}
            producedByDay={MOCK_PRODUCED_BY_DAY}
            producedToday={MOCK_META.progress}
            unit="peças"
            isAdmin
            today={TODAY}
          />
          <HistoryCard history={MOCK_HISTORY} unit="peças" days={histDays} onDaysChange={setHistDays} />
        </div>
      </div>
    </div>
  );
}

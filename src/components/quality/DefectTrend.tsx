"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { LisionCard, LisionCardHeader } from "@/components/ui/lision-card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import type { TrendPoint } from "@/hooks/use-quality-data";

interface DefectTrendProps {
  data: TrendPoint[] | null;
  loading: boolean;
}

function DefectTrend({ data, loading }: DefectTrendProps) {
  if (loading) {
    return (
      <LisionCard>
        <LisionCardHeader eyebrow="Tendência" title="Evolução de Defeitos" />
        <div className="p-4">
          <Skeleton className="h-[200px] w-full rounded-lg" />
        </div>
      </LisionCard>
    );
  }

  const hasData = data && data.length > 0 && data.some((t) => t.count > 0);

  if (!data || data.length === 0 || !hasData) {
    return (
      <LisionCard>
        <LisionCardHeader eyebrow="Tendência" title="Evolução de Defeitos" />
        <EmptyState
          icon={TrendingUp}
          title="Nenhum dado no período"
          description="Nenhum defeito registrado no período selecionado"
        />
      </LisionCard>
    );
  }

  const formatDate = (d: string) => {
    const date = new Date(d);
    return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
  };

  return (
    <LisionCard>
      <LisionCardHeader eyebrow="Tendência" title="Evolução de Defeitos" />
      <div className="p-4">
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="defectGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="oklch(0.65 0.2 25)" stopOpacity={0.4} />
                <stop offset="95%" stopColor="oklch(0.65 0.2 25)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="period"
              tickFormatter={formatDate}
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={30}
            />
            <Tooltip
              contentStyle={{
                background: "oklch(0.12 0 0)",
                border: "1px solid oklch(0.25 0 0)",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              labelFormatter={(label) => formatDate(String(label))}
              formatter={(value) => [`${value}`, "Defeitos"]}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke="oklch(0.65 0.2 25)"
              strokeWidth={2}
              fill="url(#defectGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </LisionCard>
  );
}

export { DefectTrend };

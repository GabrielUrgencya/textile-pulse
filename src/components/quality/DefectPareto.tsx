"use client";

import * as React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { ChevronDown, ChevronRight } from "lucide-react";
import { LisionCard, LisionCardHeader } from "@/components/ui/lision-card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { AlertTriangle } from "lucide-react";
import type { DefectByType } from "@/hooks/use-quality-data";

interface DefectParetoProps {
  data: DefectByType[] | null;
  loading: boolean;
}

function DefectPareto({ data, loading }: DefectParetoProps) {
  const [expanded, setExpanded] = React.useState<string | null>(null);

  if (loading) {
    return (
      <LisionCard>
        <LisionCardHeader eyebrow="Análise" title="Pareto de Defeitos" />
        <div className="p-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </LisionCard>
    );
  }

  if (!data || data.length === 0) {
    return (
      <LisionCard>
        <LisionCardHeader eyebrow="Análise" title="Pareto de Defeitos" />
        <EmptyState
          icon={AlertTriangle}
          title="Sem dados de defeitos"
          description="Nenhum defeito registrado no período selecionado"
        />
      </LisionCard>
    );
  }

  return (
    <LisionCard>
      <LisionCardHeader eyebrow="Análise" title="Pareto de Defeitos" />
      <div className="p-4">
        <ResponsiveContainer width="100%" height={Math.max(data.length * 44, 180)}>
          <BarChart data={data} layout="vertical" margin={{ left: 100, right: 20, top: 0, bottom: 0 }}>
            <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis
              dataKey="defect_type"
              type="category"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={95}
            />
            <Tooltip
              contentStyle={{
                background: "oklch(0.12 0 0)",
                border: "1px solid oklch(0.25 0 0)",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              formatter={(value) => [`${value}`, "Defeitos"]}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} cursor="pointer">
              {data.map((entry, idx) => (
                <Cell
                  key={entry.defect_type}
                  fill={`oklch(0.65 0.15 ${25 + idx * 3})`}
                  onClick={() =>
                    setExpanded(expanded === entry.defect_type ? null : entry.defect_type)
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Accordion details */}
        <div className="mt-4 space-y-1">
          {data.map((item) => (
            <div key={item.defect_type}>
              <button
                type="button"
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-secondary/30 transition-colors"
                onClick={() =>
                  setExpanded(expanded === item.defect_type ? null : item.defect_type)
                }
              >
                {expanded === item.defect_type ? (
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-3.5 text-muted-foreground" />
                )}
                <span className="font-medium">{item.defect_type}</span>
                <span className="text-muted-foreground ml-auto text-xs">
                  {item.count} ({item.percentage}%)
                </span>
              </button>
              {expanded === item.defect_type && (
                <div className="ml-8 mb-2 space-y-1">
                  <div className="text-xs text-muted-foreground mb-1">
                    Etapas mais afetadas:
                  </div>
                  {item.top_stages.map((s) => (
                    <div
                      key={s.name}
                      className="flex items-center justify-between text-xs px-2 py-1 bg-secondary/20 rounded"
                    >
                      <span>{s.name}</span>
                      <span className="font-mono text-muted-foreground">{s.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </LisionCard>
  );
}

export { DefectPareto };

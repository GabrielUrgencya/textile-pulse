"use client";

import { useId } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { KpiCard, KpiLabel } from "@/components/ui/kpi-card";

/**
 * Story 8.39 — AreaChartCard (Dashboards 2.0).
 * Área com gradiente vertical (token → transparent), sem grid vertical,
 * grid horizontal de baixa opacidade, tooltip glass. Sem cor nova.
 */

interface Point {
  label: string;
  value: number;
}

function GlassTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl px-3 py-2 bg-foreground/[0.06] backdrop-blur-md border border-foreground/15 shadow-lg">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-[14px] font-semibold tabular-nums">{payload[0].value.toLocaleString("pt-BR")}</div>
    </div>
  );
}

export function AreaChartCard({
  label,
  data,
  height = 160,
  highlight = false,
  index = 0,
}: {
  label: string;
  data: Point[];
  height?: number;
  highlight?: boolean;
  index?: number;
}) {
  const gid = useId().replace(/:/g, "");
  return (
    <KpiCard highlight={highlight} index={index} className="flex flex-col">
      <KpiLabel className="mb-3">{label}</KpiLabel>
      <div className="flex-1 min-h-0" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={`grad-${gid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--foreground)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--foreground)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--foreground)" strokeOpacity={0.08} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={32} />
            <Tooltip content={<GlassTooltip />} cursor={{ stroke: "var(--foreground)", strokeOpacity: 0.15 }} />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--foreground)"
              strokeWidth={2}
              fill={`url(#grad-${gid})`}
              isAnimationActive
              animationDuration={800}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </KpiCard>
  );
}

export type { Point as AreaChartPoint };

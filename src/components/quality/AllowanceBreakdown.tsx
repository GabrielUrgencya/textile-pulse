"use client";

import { useEffect, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface AllowanceData {
  total_defects: number;
  total_quantity_defective: number;
  total_pieces_produced: number;
  allowance_rate: number;
  allowance_target: number;
  threshold_ratio: number;
  by_type: { defect_type: string; quantity: number; percentage: number }[];
  by_responsible: {
    user_id: string;
    full_name: string;
    quantity: number;
    percentage: number;
  }[];
  by_faction: {
    faction_id: string;
    faction_name: string;
    quantity: number;
    percentage: number;
  }[];
}

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

interface AllowanceBreakdownProps {
  from?: string;
  to?: string;
}

export function AllowanceBreakdown({ from, to }: AllowanceBreakdownProps) {
  const [data, setData] = useState<AllowanceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    fetch(`/api/quality/allowance?${params}`)
      .then((r) => r.json())
      .then((res) => setData(res.data || null))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [from, to]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="flex h-64 items-center justify-center">
            <p className="text-sm text-muted-foreground">Carregando...</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex h-64 items-center justify-center">
            <p className="text-sm text-muted-foreground">Carregando...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data || data.total_defects === 0) {
    return (
      <Card>
        <CardContent className="flex h-40 items-center justify-center">
          <p className="text-sm text-muted-foreground">
            Nenhum defeito no período selecionado
          </p>
        </CardContent>
      </Card>
    );
  }

  const ratePercent = (data.allowance_rate * 100).toFixed(2);
  const targetPercent = (data.allowance_target * 100).toFixed(2);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-3">
        <Badge
          variant={
            data.threshold_ratio > 1
              ? "destructive"
              : data.threshold_ratio > 0.8
                ? "secondary"
                : "outline"
          }
        >
          Taxa: {ratePercent}% / Meta: {targetPercent}%
        </Badge>
        <span className="text-xs text-muted-foreground">
          {data.total_quantity_defective} defeitos em{" "}
          {data.total_pieces_produced.toLocaleString("pt-BR")} peças
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Donut — by type */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Por Tipo de Defeito</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={data.by_type}
                  dataKey="quantity"
                  nameKey="defect_type"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {data.by_type.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name) => [
                    `${value} peças`,
                    String(name),
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-2 mt-2">
              {data.by_type.map((t, i) => (
                <span key={t.defect_type} className="flex items-center gap-1 text-xs">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}
                  />
                  {t.defect_type} ({t.percentage.toFixed(0)}%)
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Bar — top 5 responsible */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Top Responsáveis</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={data.by_responsible.slice(0, 5)}
                layout="vertical"
                margin={{ left: 60 }}
              >
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="full_name"
                  width={55}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip
                  formatter={(value) => [`${value} peças`, "Defeitos"]}
                />
                <Bar
                  dataKey="quantity"
                  fill="hsl(var(--chart-1))"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

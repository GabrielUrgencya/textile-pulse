"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Truck, Timer, Users } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface OpsClockMetricsData {
  total_drivers: number;
  avg_wait_minutes: number;
  avg_load_minutes: number;
  active_count: number;
}

interface DailyMetric {
  date: string;
  label: string;
  avg_wait: number;
  avg_load: number;
}

export function OpsClockMetrics() {
  const [metrics, setMetrics] = useState<OpsClockMetricsData | null>(null);
  const [dailyData, setDailyData] = useState<DailyMetric[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        // Today's metrics
        const metricsRes = await fetch("/api/ops-clock/metrics");
        if (metricsRes.ok) {
          const json = await metricsRes.json();
          setMetrics(json.data);
        }

        // Last 7 days for chart
        const days: DailyMetric[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().slice(0, 10);
          const dayLabel = d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");

          const res = await fetch(
            `/api/ops-clock/metrics?from=${dateStr}&to=${dateStr}`
          );
          if (res.ok) {
            const json = await res.json();
            days.push({
              date: dateStr,
              label: dayLabel,
              avg_wait: json.data.avg_wait_minutes,
              avg_load: json.data.avg_load_minutes,
            });
          }
        }
        setDailyData(days);
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex h-64 items-center justify-center">
          <p className="text-sm text-muted-foreground">Carregando métricas...</p>
        </CardContent>
      </Card>
    );
  }

  if (!metrics) {
    return (
      <Card>
        <CardContent className="flex h-64 items-center justify-center">
          <p className="text-sm text-muted-foreground">
            Erro ao carregar métricas
          </p>
        </CardContent>
      </Card>
    );
  }

  const gauges = [
    {
      label: "Motoristas Hoje",
      value: metrics.total_drivers,
      unit: "",
      icon: Users,
      color: "text-foreground",
    },
    {
      label: "Ativos Agora",
      value: metrics.active_count,
      unit: "",
      icon: Truck,
      color: "text-blue-500",
    },
    {
      label: "Tempo Médio Espera",
      value: metrics.avg_wait_minutes,
      unit: "min",
      icon: Clock,
      color:
        metrics.avg_wait_minutes >= 60
          ? "text-red-500"
          : metrics.avg_wait_minutes >= 30
            ? "text-amber-500"
            : "text-foreground",
    },
    {
      label: "Tempo Médio Carga",
      value: metrics.avg_load_minutes,
      unit: "min",
      icon: Timer,
      color: "text-foreground",
    },
  ];

  const barColors = ["#6366f1", "#6366f1", "#6366f1", "#6366f1", "#6366f1", "#6366f1", "#8b5cf6"];

  return (
    <div className="space-y-4">
      {/* Gauge cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {gauges.map((g) => (
          <Card key={g.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <g.icon className={`h-8 w-8 ${g.color}`} />
              <div>
                <p className="text-xs text-muted-foreground">{g.label}</p>
                <p className={`font-mono text-2xl font-bold tabular-nums ${g.color}`}>
                  {g.value}
                  {g.unit && (
                    <span className="ml-1 text-sm font-normal text-muted-foreground">
                      {g.unit}
                    </span>
                  )}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Bar chart - last 7 days */}
      {dailyData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Tempo Médio de Espera — Últimos 7 dias
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={dailyData}
                layout="horizontal"
                margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
              >
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v) => `${v}min`}
                />
                <Tooltip
                  formatter={(value) => [`${value} min`, "Espera"]}
                  labelFormatter={(label) => `${label}`}
                />
                <Bar dataKey="avg_wait" radius={[4, 4, 0, 0]} maxBarSize={40}>
                  {dailyData.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={barColors[index % barColors.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

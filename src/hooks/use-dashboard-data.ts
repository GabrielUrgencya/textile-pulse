"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { UserProfile } from "@/hooks/use-user-profile";

/* ─────────────────── Types matching API responses ─────────────────── */

export interface KpiResult {
  produced_today: number;
  defect_rate: number;
  active_ops: number;
  lots_by_stage: Array<{ stage_name: string; stage_id: string; count: number }>;
  top_producers: Array<{ user_id: string; full_name: string; scan_count: number }>;
  total_lots: number;
  total_scans: number;
  /** Weighted points value when meta ponderada is enabled */
  weighted_points?: number;
  /** Whether weighted meta is active */
  use_weighted_meta?: boolean;
  /** Story 8.18: tempo médio por etapa (pares STAGE_IN→STAGE_OUT) */
  avg_stage_durations?: Array<{
    stage_id: string;
    stage_name: string;
    avg_hours: number;
    samples: number;
  }>;
}

export interface ChartDataPoint {
  period: string;
  scans: number;
  defects: number;
}

export interface ProductionOrder {
  id: string;
  op_number: string;
  product_name: string;
  total_quantity: number;
  status: string;
  due_date: string | null;
  created_at: string;
}

export interface Targets {
  dailyPiecesTarget: number;
  productivityTarget: number;
  defectTolerance: number;
  lotsTarget: number;
  opsTarget: number;
  shiftStart: string;
  shiftEnd: string;
}

export interface StaleLot {
  barcode: string;
  lot_number: string;
  op_number: string;
  stage_name: string;
  hours_stalled: number;
}

export interface ActivityEvent {
  time: string;
  operator_name: string;
  action: string;
  barcode: string;
  stage_name: string;
}

export interface MyMeta {
  stage_id: string;
  stage_name: string;
  target: number | null;
  unit: string | null;
  progress: number;
  percent: number;
}

export interface DashboardData {
  kpis: KpiResult | null;
  chart: ChartDataPoint[];
  orders: ProductionOrder[];
  targets: Targets;
  staleLots: StaleLot[];
  activity: ActivityEvent[];
  profile: UserProfile | null;
  myMeta: MyMeta | null;
  isAuthenticated: boolean;
}

export interface UseDashboardDataReturn {
  data: DashboardData;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export interface DateRange {
  from: string;
  to: string;
}

const DEFAULT_TARGETS: Targets = {
  dailyPiecesTarget: 1000,
  productivityTarget: 85,
  defectTolerance: 3,
  lotsTarget: 100,
  opsTarget: 15,
  shiftStart: "07:00",
  shiftEnd: "17:00",
};

const POLL_INTERVAL_MS = 30_000;

export function useDashboardData(dateRange?: DateRange): UseDashboardDataReturn {
  const [data, setData] = useState<DashboardData>({
    kpis: null,
    chart: [],
    orders: [],
    targets: DEFAULT_TARGETS,
    staleLots: [],
    activity: [],
    profile: null,
    myMeta: null,
    isAuthenticated: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const authFailedRef = useRef(false);

  const fromParam = dateRange?.from;
  const toParam = dateRange?.to;

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const fetchAll = useCallback(async () => {
    if (authFailedRef.current) return;

    try {
      const today = new Date().toISOString().slice(0, 10);
      const from = fromParam || today;
      const to = toParam || today;

      const res = await fetch(`/api/dashboard/all?from=${from}&to=${to}`, {
        credentials: "same-origin",
      });

      if (res.status === 401) {
        authFailedRef.current = true;
        stopPolling();
        setData((prev) => ({ ...prev, isAuthenticated: false }));
        setError("Não autenticado");
        setIsLoading(false);
        return;
      }

      if (!res.ok) {
        setError("Erro no servidor ao carregar dados");
        setIsLoading(false);
        return;
      }

      const json = await res.json();

      setData({
        kpis: json.kpis || null,
        chart: json.chart || [],
        orders: json.orders || [],
        targets: json.targets || DEFAULT_TARGETS,
        staleLots: json.staleLots || [],
        activity: json.activity || [],
        profile: json.profile || null,
        myMeta: json.my_meta || null,
        isAuthenticated: true,
      });
      setError(null);
    } catch {
      setError("Erro de conexão ao carregar dados");
    } finally {
      setIsLoading(false);
    }
  }, [stopPolling, fromParam, toParam]);

  useEffect(() => {
    setIsLoading(true);
    fetchAll();
    intervalRef.current = setInterval(fetchAll, POLL_INTERVAL_MS);
    return () => stopPolling();
  }, [fetchAll, stopPolling]);

  return { data, isLoading, error, refetch: fetchAll };
}

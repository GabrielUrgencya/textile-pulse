"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ─────────────────── Types matching API responses ─────────────────── */

export interface KpiResult {
  produced_today: number;
  defect_rate: number;
  active_ops: number;
  lots_by_stage: Array<{ stage_name: string; stage_id: string; count: number }>;
  top_producers: Array<{ user_id: string; full_name: string; scan_count: number }>;
  total_lots: number;
  total_scans: number;
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

export interface DashboardData {
  kpis: KpiResult | null;
  chart: ChartDataPoint[];
  orders: ProductionOrder[];
  isAuthenticated: boolean;
}

export interface UseDashboardDataReturn {
  data: DashboardData;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

const POLL_INTERVAL_MS = 30_000;

async function fetchJson<T>(url: string): Promise<{ data: T; status: number }> {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) {
    return { data: null as unknown as T, status: res.status };
  }
  const data = await res.json() as T;
  return { data, status: res.status };
}

export interface DateRange {
  from: string;
  to: string;
}

export function useDashboardData(dateRange?: DateRange): UseDashboardDataReturn {
  const [data, setData] = useState<DashboardData>({
    kpis: null,
    chart: [],
    orders: [],
    isAuthenticated: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const authFailedRef = useRef(false);

  // Stabilize dateRange reference to avoid unnecessary re-renders
  const fromParam = dateRange?.from;
  const toParam = dateRange?.to;

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const fetchAll = useCallback(async () => {
    // Don't retry if auth already failed
    if (authFailedRef.current) return;

    try {
      const today = new Date().toISOString().slice(0, 10);
      const from = fromParam || today;
      const to = toParam || today;

      const [kpisRes, chartRes, ordersRes] = await Promise.all([
        fetchJson<{ kpis: KpiResult }>(`/api/dashboard/kpis?from=${from}&to=${to}`),
        fetchJson<{ chart: ChartDataPoint[] }>(`/api/dashboard/production-chart?from=${from}&to=${to}`),
        fetchJson<{ orders: ProductionOrder[] }>(`/api/production/orders?limit=10`),
      ]);

      // Check if any request returned 401 (not authenticated)
      const anyUnauthorized =
        kpisRes.status === 401 ||
        chartRes.status === 401 ||
        ordersRes.status === 401;

      if (anyUnauthorized) {
        // Stop polling — no point retrying without auth
        authFailedRef.current = true;
        stopPolling();
        setData({
          kpis: null,
          chart: [],
          orders: [],
          isAuthenticated: false,
        });
        setError("Não autenticado");
        setIsLoading(false);
        return;
      }

      // Check for server errors (5xx)
      const anyServerError =
        kpisRes.status >= 500 ||
        chartRes.status >= 500 ||
        ordersRes.status >= 500;

      setData({
        kpis: kpisRes.status === 200 ? kpisRes.data.kpis : null,
        chart: chartRes.status === 200 ? chartRes.data.chart : [],
        orders: ordersRes.status === 200 ? ordersRes.data.orders : [],
        isAuthenticated: true,
      });

      setError(anyServerError ? "Erro no servidor ao carregar alguns dados" : null);
    } catch {
      setError("Erro de conexão ao carregar dados");
    } finally {
      setIsLoading(false);
    }
  }, [stopPolling, fromParam, toParam]);

  useEffect(() => {
    // Show loading on period change
    setIsLoading(true);
    fetchAll();
    intervalRef.current = setInterval(fetchAll, POLL_INTERVAL_MS);
    return () => stopPolling();
  }, [fetchAll, stopPolling]);

  return { data, isLoading, error, refetch: fetchAll };
}

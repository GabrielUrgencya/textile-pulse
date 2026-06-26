"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TVHeader } from "@/components/tv/TVHeader";
import { TVHero } from "@/components/tv/TVHero";
import { TVKpis } from "@/components/tv/TVKpis";
import { TVStageFlow } from "@/components/tv/TVStageFlow";
import { TVAlerts } from "@/components/tv/TVAlerts";
import { TVRankingOverlay } from "@/components/tv/TVRankingOverlay";
import { FullscreenButton } from "@/components/tv/FullscreenButton";

// ─── Types matching API response shape ─────────────────────
interface DashboardData {
  kiosk: { token_name: string; scope: string };
  shift: { start: string; end: string; active_shift: string | null };
  production: {
    produced_today: number;
    daily_target: number;
    percent: number;
    current_rate: number;
    peak_rate: number;
    projected_end: number;
  };
  kpis: {
    active_ops: number;
    ops_target: number;
    active_lots: number;
    lots_target: number;
    defect_rate: number;
    defect_tolerance: number;
    scans_today: number;
    scans_yesterday: number;
  };
  lots_by_stage: Array<{
    stage_name: string;
    display_name: string;
    count: number;
    order_index: number;
    color: string;
  }>;
  avg_stage_durations?: Array<{
    stage_id: string;
    stage_name: string;
    avg_hours: number;
    samples: number;
  }>;
  alerts: Array<{
    type: "stale_lot" | "overdue_shipment";
    severity: "critical" | "warning";
    barcode?: string;
    op_number?: string;
    stage_name?: string;
    hours_stalled?: number;
    faction_name?: string;
    expected_return_at?: string;
    days_overdue?: number;
  }>;
  recent_activity: Array<{
    barcode: string;
    stage_name: string;
    operator_name: string;
    scanned_at: string;
  }>;
  faction_ranking: Array<{
    id: string;
    name: string;
    initials: string;
    avatar_url: string | null;
    score: number;
    punctuality: number;
    quality: number;
    volume: number;
    deliveries_count: number;
  }>;
  timestamp: string;
}

// ─── Main content ──────────────────────────────────────────
function TVDashboardContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const initialLoad = useRef(true);

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`/api/kiosk/dashboard?token=${token}&shift=current`);
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Falha ao carregar dashboard");
        return;
      }
      const json: DashboardData = await res.json();
      setData(json);
      setError(null);
      initialLoad.current = false;
    } catch {
      setError("Erro de conexão");
    }
  }, [token]);

  // Initial fetch + 15s silent refresh (no remount, just state update)
  useEffect(() => {
    if (!token) {
      setError("Token não informado. Use /tv?token=<uuid>");
      return;
    }
    fetchData();
    const interval = setInterval(fetchData, 15_000);
    return () => clearInterval(interval);
  }, [token, fetchData]);

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-background text-destructive text-[28px] font-medium px-8 text-center">
        {error}
      </div>
    );
  }

  // Loading state
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background gap-4">
        <div className="size-10 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />
        <span className="text-[18px] text-muted-foreground">
          Carregando dashboard...
        </span>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-background bg-radial bg-grid flex flex-col overflow-hidden">
      {/* Story 8.31: botão de tela cheia */}
      <FullscreenButton />
      {/* Header — top bar + white ticker */}
      <TVHeader
        tokenName={data.kiosk.token_name}
        shiftStart={data.shift.start}
        shiftEnd={data.shift.end}
        activeShift={data.shift.active_shift}
        recentActivity={data.recent_activity}
        factionRanking={data.faction_ranking.slice(0, 3)}
      />

      {/* Dashboard content */}
      <div className="flex-1 flex flex-col gap-2.5 px-5 pt-2.5 pb-3 overflow-hidden">
        {/* Top row — Radial Gauge + 6 KPIs */}
        <div className="grid grid-cols-12 gap-2.5">
          <div className="col-span-5">
            <TVHero
              producedToday={data.production.produced_today}
              dailyTarget={data.production.daily_target}
              percent={data.production.percent}
              currentRate={data.production.current_rate}
              peakRate={data.production.peak_rate}
              projectedEnd={data.production.projected_end}
              activeShift={data.shift.active_shift}
            />
          </div>
          <div className="col-span-7">
            <TVKpis
              activeOps={data.kpis.active_ops}
              opsTarget={data.kpis.ops_target}
              activeLots={data.kpis.active_lots}
              lotsTarget={data.kpis.lots_target}
              defectRate={data.kpis.defect_rate}
              defectTolerance={data.kpis.defect_tolerance}
              scansToday={data.kpis.scans_today}
              scansYesterday={data.kpis.scans_yesterday}
              currentRate={data.production.current_rate}
              peakRate={data.production.peak_rate}
              projectedEnd={data.production.projected_end}
              dailyTarget={data.production.daily_target}
            />
          </div>
        </div>

        {/* Bottom row — Stage Flow + Alerts (stretch to fill) */}
        <div className="grid grid-cols-12 gap-2.5 flex-1 min-h-0">
          <div className="col-span-7 min-h-0">
            <TVStageFlow stages={data.lots_by_stage} avgStageDurations={data.avg_stage_durations} />
          </div>
          <div className="col-span-5 min-h-0">
            <TVAlerts alerts={data.alerts} />
          </div>
        </div>
      </div>

      {/* Ranking overlay — appears every 120s for 15s */}
      {data.faction_ranking.length >= 1 && (
        <TVRankingOverlay
          ranking={data.faction_ranking}
          cycleInterval={55_000}
          showDuration={15_000}
        />
      )}
    </div>
  );
}

// ─── Page wrapper ──────────────────────────────────────────
export default function TVDashboard() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen bg-background text-foreground text-[18px]">
          Carregando...
        </div>
      }
    >
      <TVDashboardContent />
    </Suspense>
  );
}

"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StageCount {
  stage_name: string;
  count: number;
}

interface OpData {
  id: string;
  op_number: string;
  product_name: string;
  total_quantity: number;
  lots_count: number;
  lots_by_stage: StageCount[];
  progress_percent: number;
}

interface StaleLot {
  barcode: string;
  lot_number: string;
  op_number: string;
  stage_name: string;
  hours_stalled: number;
  entered_current_stage_at: string;
}

interface KioskData {
  kiosk: { token_name: string; scope: string };
  kpis: {
    scans_today: number;
    active_ops: number;
    lots_by_stage: StageCount[];
  };
  ops: OpData[];
  stale_lots: StaleLot[];
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Stage colors
// ---------------------------------------------------------------------------

const STAGE_COLORS: Record<string, string> = {
  CORTE: "#3b82f6",
  AVIAMENTOS: "#8b5cf6",
  PRODUCAO: "#f59e0b",
  "PRODUÇÃO": "#f59e0b",
  TRAVETE: "#f97316",
  LIMPEZA: "#06b6d4",
  CONFERENCIA: "#10b981",
  "CONFERÊNCIA": "#10b981",
  EMBALAGEM: "#22c55e",
  ESTOQUE: "#6366f1",
  // Fallback color handled in getStageColor
};

const FALLBACK_COLORS = [
  "#ec4899", "#14b8a6", "#a855f7", "#f43f5e", "#0ea5e9", "#84cc16",
];

function getStageColor(name: string, index: number): string {
  const upper = name.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return STAGE_COLORS[upper] || STAGE_COLORS[name.toUpperCase()] || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

// ---------------------------------------------------------------------------
// Clock hook
// ---------------------------------------------------------------------------

function useClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return time;
}

// ---------------------------------------------------------------------------
// Auto-scroll hook
// ---------------------------------------------------------------------------

function useAutoScroll(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [needsScroll, setNeedsScroll] = useState(false);
  const [scrollDuration, setScrollDuration] = useState(20);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      const overflows = el.scrollHeight > el.clientHeight + 10;
      setNeedsScroll(overflows);
      if (overflows) {
        // Duration proportional to overflow amount (min 15s, max 60s)
        const overflow = el.scrollHeight - el.clientHeight;
        const duration = Math.max(15, Math.min(60, Math.round(overflow / 30)));
        setScrollDuration(duration);
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [containerRef]);

  return { needsScroll, scrollDuration };
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

function formatHours(h: number): string {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  if (hrs === 0) return `${mins}min`;
  return `${hrs}h ${mins}min`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KpiCard({ label, value, accent = "text-white" }: { label: string; value: number | string; accent?: string }) {
  return (
    <div className="rounded-2xl bg-slate-800/80 border border-slate-700/50 px-6 py-5 flex flex-col items-center justify-center min-w-[200px]">
      <span className="text-slate-400 text-sm font-medium uppercase tracking-wider mb-1">{label}</span>
      <span className={`text-5xl font-bold tabular-nums ${accent}`}>{value}</span>
    </div>
  );
}

function ProgressBar({ stages, lotsCount }: { stages: StageCount[]; lotsCount: number }) {
  if (lotsCount === 0) return <div className="h-6 rounded-full bg-slate-700/50" />;

  return (
    <div className="flex h-6 rounded-full overflow-hidden bg-slate-700/50 w-full">
      {stages.map((s, i) => {
        const pct = (s.count / lotsCount) * 100;
        if (pct === 0) return null;
        return (
          <div
            key={s.stage_name}
            className="h-full flex items-center justify-center text-xs font-semibold text-white/90 transition-all duration-700 min-w-[2px]"
            style={{ width: `${pct}%`, backgroundColor: getStageColor(s.stage_name, i) }}
            title={`${s.stage_name}: ${s.count}`}
          >
            {pct >= 8 ? s.count : ""}
          </div>
        );
      })}
    </div>
  );
}

function OpCard({ op }: { op: OpData }) {
  return (
    <div className="rounded-2xl bg-slate-800/60 border border-slate-700/40 p-5 space-y-3">
      {/* Header */}
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="text-blue-400 font-bold text-2xl shrink-0">{op.op_number}</span>
          <span className="text-slate-300 text-xl truncate">{op.product_name}</span>
        </div>
        <div className="flex items-baseline gap-2 shrink-0">
          <span className="text-slate-400 text-lg">{op.total_quantity.toLocaleString("pt-BR")} pcs</span>
          <span className="text-2xl font-bold text-white tabular-nums">{op.progress_percent}%</span>
        </div>
      </div>

      {/* Progress bar */}
      <ProgressBar stages={op.lots_by_stage} lotsCount={op.lots_count} />

      {/* Stage breakdown */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {op.lots_by_stage.map((s, i) => (
          <span key={s.stage_name} className="text-sm flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: getStageColor(s.stage_name, i) }}
            />
            <span className="text-slate-400">{s.stage_name}:</span>
            <span className="text-white font-semibold">{s.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function StaleLotRow({ lot }: { lot: StaleLot }) {
  const isCritical = lot.hours_stalled >= 4;

  return (
    <div
      className={`flex items-center justify-between px-4 py-3 rounded-xl border ${
        isCritical
          ? "border-red-500/70 bg-red-950/40 animate-pulse-slow"
          : "border-amber-500/50 bg-amber-950/30"
      }`}
    >
      <div className="flex items-center gap-4">
        <span className={`text-2xl ${isCritical ? "text-red-400" : "text-amber-400"}`}>
          {isCritical ? "!!!" : "!"}
        </span>
        <div>
          <span className="text-white font-semibold text-lg">{lot.lot_number}</span>
          <span className="text-slate-400 ml-2 text-base">({lot.op_number})</span>
        </div>
        <span className="text-slate-300 text-base">{lot.stage_name}</span>
      </div>
      <span className={`text-xl font-bold tabular-nums ${isCritical ? "text-red-400" : "text-amber-400"}`}>
        {formatHours(lot.hours_stalled)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main content
// ---------------------------------------------------------------------------

function TVDashboardContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [data, setData] = useState<KioskData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const clock = useClock();
  const { needsScroll, scrollDuration } = useAutoScroll(scrollContainerRef);

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`/api/kiosk/dashboard?token=${token}`);
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Falha ao carregar dashboard");
        return;
      }
      const json = await res.json();
      setData(json);
      setError(null);
    } catch {
      setError("Erro de conexão");
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      setError("Token não informado. Use /tv?token=<uuid>");
      return;
    }
    fetchData();
    const interval = setInterval(fetchData, 15_000); // AC5: 15s refresh
    return () => clearInterval(interval);
  }, [token, fetchData]);

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950 text-red-400 text-2xl font-medium px-8 text-center">
        {error}
      </div>
    );
  }

  // Loading state
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-950 text-white gap-4">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-2xl text-slate-300">Carregando dashboard...</span>
      </div>
    );
  }

  const totalLots = data.ops.reduce((sum, op) => sum + op.lots_count, 0);

  return (
    <div className="h-screen w-screen bg-slate-950 text-white flex flex-col overflow-hidden">
      {/* ───── Header (64px) ───── */}
      <header className="flex items-center justify-between px-8 h-16 bg-slate-900/80 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-black tracking-tight text-blue-400">LISION</span>
          <span className="text-slate-500 text-xl font-light">—</span>
          <span className="text-slate-300 text-xl">{data.kiosk.token_name}</span>
        </div>
        <time className="text-3xl font-mono tabular-nums text-slate-300">
          {clock.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </time>
      </header>

      {/* ───── KPI Row ───── */}
      <div className="flex items-center justify-center gap-6 px-8 py-4 shrink-0">
        <KpiCard label="Scans Hoje" value={data.kpis.scans_today} accent="text-blue-400" />
        <KpiCard label="OPs Ativas" value={data.kpis.active_ops} accent="text-emerald-400" />
        <KpiCard label="Lotes em Produção" value={totalLots} accent="text-amber-400" />
      </div>

      {/* ───── Scrollable content area ───── */}
      <div className="flex-1 overflow-hidden relative">
        <div
          ref={scrollContainerRef}
          className={needsScroll ? "auto-scroll-container" : ""}
          style={needsScroll ? { animationDuration: `${scrollDuration}s` } : undefined}
        >
          {/* OP Cards */}
          <div className="px-8 pb-4 space-y-4">
            {data.ops.length > 0 ? (
              data.ops.map((op) => <OpCard key={op.id} op={op} />)
            ) : (
              <div className="text-center text-slate-500 text-2xl py-16">
                Nenhuma OP ativa no momento
              </div>
            )}
          </div>

          {/* ───── Stale Lots Alert Row ───── */}
          {data.stale_lots.length > 0 && (
            <div className="px-8 pb-6">
              <div className="rounded-2xl bg-slate-900/60 border border-amber-500/30 p-5 space-y-3">
                <h3 className="text-amber-400 text-xl font-bold flex items-center gap-2">
                  <span className="text-2xl">&#9888;</span>
                  LOTES PARADOS
                  <span className="ml-2 text-base font-normal text-slate-400">
                    ({data.stale_lots.length} {data.stale_lots.length === 1 ? "lote" : "lotes"} &gt; 2h)
                  </span>
                </h3>
                <div className="space-y-2">
                  {data.stale_lots.map((lot) => (
                    <StaleLotRow key={lot.barcode} lot={lot} />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ───── Auto-scroll CSS ───── */}
      <style jsx global>{`
        @keyframes autoScroll {
          0%, 10% {
            transform: translateY(0);
          }
          45%, 55% {
            transform: translateY(var(--scroll-distance));
          }
          90%, 100% {
            transform: translateY(0);
          }
        }

        .auto-scroll-container {
          --scroll-distance: calc(-100% + 100vh - 180px);
          animation: autoScroll var(--scroll-duration, 20s) ease-in-out infinite;
          will-change: transform;
        }

        .animate-pulse-slow {
          animation: pulse-slow 2s ease-in-out infinite;
        }

        @keyframes pulse-slow {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page wrapper with Suspense
// ---------------------------------------------------------------------------

export default function TVDashboard() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen bg-slate-950 text-white text-2xl">
          Carregando...
        </div>
      }
    >
      <TVDashboardContent />
    </Suspense>
  );
}

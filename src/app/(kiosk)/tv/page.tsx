"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { FullscreenButton } from "@/components/tv/FullscreenButton";
import { type SectorOption } from "@/components/tv/TVSectorSelector";
import { TVCelebration, type CelebrationItem } from "@/components/tv/TVCelebration";
import { TVHeaderV2 } from "@/components/tv/TVHeaderV2";
import { TVSectorDefault } from "@/components/tv/TVSectorDefault";
import { TVOverviewDefault } from "@/components/tv/TVOverviewDefault";
import { subscribeToTvConfig } from "@/lib/realtime";
import { isFactionPanelVisible, type KPIWidget } from "@/lib/dashboard-config";
import type { SectorKpis } from "@/lib/sector-kpis";

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
  // Épico Metas/KPIs por Setor (8.34/8.35/8.36) + Dashboards 2.0 (8.40)
  tenant_id?: string;
  sectors?: SectorOption[];
  active_sector?: { id: string; name: string } | null;
  sector_kpis?: SectorKpis | null;
  dashboard_config?: { layout: KPIWidget[]; isDefault: boolean } | null;
  achievements_today?: CelebrationItem[];
  timestamp: string;
}

// ─── Main content ──────────────────────────────────────────
function TVDashboardContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const initialLoad = useRef(true);

  // Story 8.40 — estado da conexão realtime (broadcast de config)
  const [connected, setConnected] = useState(false);

  // Cliente anon p/ Realtime broadcast (não exige sessão — kiosk)
  const realtimeClient = useMemo<SupabaseClient | null>(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  }, []);

  // Story 9.1 — TV travada num setor via URL (?stage=<stageId>). Sobrepõe
  // dropdown/localStorage: cada setor tem sua própria URL de TV standalone.
  const lockedStage = searchParams.get("stage");
  const isLocked = !!lockedStage;

  // Story 8.34 — setor selecionado (persistido por token; null = Visão Geral)
  const [sectorId, setSectorId] = useState<string | null>(lockedStage);
  const sectorKey = token ? `tv_sector_${token}` : "tv_sector";

  // Carrega a seleção persistida no mount (não reseta no reload).
  // No modo travado (URL) a URL manda — não lê/grava localStorage.
  useEffect(() => {
    if (!token || isLocked) return;
    try {
      const saved = localStorage.getItem(`tv_sector_${token}`);
      if (saved) setSectorId(saved);
    } catch { /* ignore */ }
  }, [token, isLocked]);

  const changeSector = useCallback((id: string | null) => {
    if (isLocked) return; // travado por URL — ignora troca manual
    setSectorId(id);
    try {
      if (id) localStorage.setItem(sectorKey, id);
      else localStorage.removeItem(sectorKey);
    } catch { /* ignore */ }
  }, [sectorKey, isLocked]);

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const stageQS = sectorId ? `&stage_id=${sectorId}` : "";
      const res = await fetch(`/api/kiosk/dashboard?token=${token}&shift=current${stageQS}`);
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
  }, [token, sectorId]);

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

  // Refs estáveis p/ o callback do realtime não re-assinar a cada poll/troca
  const sectorIdRef = useRef(sectorId);
  sectorIdRef.current = sectorId;
  const fetchDataRef = useRef(fetchData);
  fetchDataRef.current = fetchData;

  // Story 8.40 — assina o canal de config da TV (broadcast). Ao publicar (8.41),
  // recarrega a config do setor ativo em <2s, sem refresh.
  const tenantId = data?.tenant_id;
  useEffect(() => {
    if (!realtimeClient || !tenantId) return;
    const channel = subscribeToTvConfig(
      realtimeClient,
      tenantId,
      (payload) => {
        // recarrega se o publish é do setor ativo (ou geral sem stage)
        if (!payload.stage_id || payload.stage_id === sectorIdRef.current) {
          fetchDataRef.current();
        }
      },
      (isConnected) => setConnected(isConnected),
    );
    return () => {
      realtimeClient.removeChannel(channel);
      setConnected(false);
    };
  }, [realtimeClient, tenantId]);

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

  const sectors = data.sectors || [];
  const activeSector = data.active_sector || null;
  const sectorKpis = data.sector_kpis || null;

  return (
    <div className="h-screen w-screen bg-background bg-radial bg-grid flex flex-col overflow-hidden">
      {/* Story 8.31: botão de tela cheia */}
      <FullscreenButton />
      {/* Story 8.36: celebração ao bater meta (fila) */}
      <TVCelebration achievements={data.achievements_today || []} storageKey={`tv_celebrated_${token}`} />
      {/* Story 8.40 — Header redesenhado (nome do setor, pills, relógio, data, status) */}
      <TVHeaderV2
        tokenName={data.kiosk.token_name}
        sectors={sectors}
        activeId={sectorId}
        onSelect={changeSector}
        activeName={activeSector ? activeSector.name : "Visão Geral"}
        connected={connected}
        locked={isLocked}
      />

      {/* Dashboard content */}
      <div className="flex-1 flex flex-col gap-4 px-6 pt-4 pb-6 overflow-hidden">
        {activeSector ? (
          /* ── Visão por SETOR — redesign "Instrumento" (Frente 4) ──
             TODOS os setores usam o MESMO layout premium (não pode haver setor
             com tela antiga e setor com tela nova). A ÚNICA customização por
             setor é esconder o painel "Status da Facção" onde ele não faz
             sentido — controlada em Config. da TV. */
          <div className="flex-1 min-h-0">
            <TVSectorDefault
              kpis={sectorKpis}
              showFaction={isFactionPanelVisible(data.dashboard_config?.layout)}
            />
          </div>
        ) : (
          /* ── Visão GERAL — redesign "Instrumento" (Frente 4) ──
             Mesma linguagem do setor (gauge herói + glow de estado + vidro),
             com os dados agregados do tenant. Sem tela legada. */
          <div className="flex-1 min-h-0">
            <TVOverviewDefault
              production={data.production}
              kpis={data.kpis}
              stages={data.lots_by_stage}
              avgStageDurations={data.avg_stage_durations}
              alerts={data.alerts}
            />
          </div>
        )}
      </div>
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

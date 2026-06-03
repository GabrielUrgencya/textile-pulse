"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  ScanLine,
  Maximize2,
  Minimize2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Volume2,
  VolumeX,
} from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { LisionCard, LisionCardHeader } from "@/components/ui/lision-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { MetricBox } from "@/components/ui/metric-box";
import { DefectModal } from "@/components/defects/DefectModal";
import { supabase } from "@/lib/supabase";

/* ────────────── Types ────────────── */

interface Stage {
  id: string;
  name: string;
  order_index: number;
}

interface ScanResult {
  id: string;
  barcode: string;
  stageName: string;
  status: "success" | "warning" | "destructive";
  message: string;
  lotId?: string;
  lotStatus?: string;
  warning?: string;
  timestamp: Date;
}

/* ────────────── Stage icon map ────────────── */

const STAGE_LABELS: Record<string, string> = {
  CORTE: "Corte",
  AVIAMENTOS: "Aviamentos",
  PRODUCAO: "Produção",
  TRAVETE: "Travete",
  LIMPEZA: "Limpeza",
  CONFERENCIA: "Conferência",
  EMBALAGEM: "Embalagem",
  ESTOQUE: "Estoque",
};

/* ────────────── Audio helper ────────────── */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  return audioCtx;
}

function beep(frequency: number, duration: number) {
  const ctx = getAudioContext();
  if (!ctx) return;
  // Resume if suspended (browser autoplay policy)
  if (ctx.state === "suspended") ctx.resume();
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  oscillator.frequency.value = frequency;
  oscillator.type = "sine";
  gainNode.gain.value = 0.3;
  oscillator.start();
  oscillator.stop(ctx.currentTime + duration / 1000);
}

function beepSuccess() {
  beep(880, 150);
}

function beepError() {
  beep(220, 200);
  setTimeout(() => beep(220, 200), 250);
}

function beepWarning() {
  beep(440, 200);
}

/* ────────────── Helpers ────────────── */

function formatTime(date: Date) {
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/* ────────────── Page ────────────── */

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <ScanPage />
    </Suspense>
  );
}

function ScanPage() {
  const searchParams = useSearchParams();
  const station = searchParams.get("station") ?? "";

  // State
  const [stages, setStages] = useState<Stage[]>([]);
  const [selectedStageId, setSelectedStageId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [stagesError, setStagesError] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [barcode, setBarcode] = useState("");
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [history, setHistory] = useState<ScanResult[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [sessionStats, setSessionStats] = useState({ total: 0, success: 0, warnings: 0, errors: 0 });
  const [defectModalOpen, setDefectModalOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number>(0);

  // T1: Load stages from DB
  useEffect(() => {
    async function loadStages() {
      const { data, error } = await supabase
        .from("stages")
        .select("id, name, order_index")
        .order("order_index", { ascending: true });

      if (error || !data) {
        setStagesError(true);
        setLoading(false);
        return;
      }
      setStages(data);
      // Restore saved stage from localStorage
      const saved = localStorage.getItem("lision-scan-stage");
      if (saved && data.some((s) => s.id === saved)) {
        setSelectedStageId(saved);
      } else if (data.length > 0) {
        setSelectedStageId(data[0].id);
      }
      setLoading(false);
    }
    loadStages();
  }, []);

  // Persist stage selection
  useEffect(() => {
    if (selectedStageId) {
      localStorage.setItem("lision-scan-stage", selectedStageId);
    }
  }, [selectedStageId]);

  // T5: Fullscreen listeners
  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  // Auto-focus input
  useEffect(() => {
    if (!loading) {
      inputRef.current?.focus();
    }
  }, [loading, lastResult]);

  // T5: Toggle fullscreen
  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen().catch(() => {});
    } else {
      await document.exitFullscreen().catch(() => {});
    }
  }, []);

  // T2: Handle scan submission
  const handleScan = useCallback(
    async (scannedBarcode: string) => {
      if (!scannedBarcode.trim() || !selectedStageId || scanning) return;

      // Debounce: prevent double-scan within 300ms
      const now = Date.now();
      if (now - debounceRef.current < 300) return;
      debounceRef.current = now;

      setScanning(true);
      const stageName = stages.find((s) => s.id === selectedStageId)?.name ?? "";

      try {
        const res = await fetch("/api/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            barcode: scannedBarcode.trim(),
            stage_id: selectedStageId,
            device_info: station || undefined,
          }),
        });

        const data = await res.json();
        let result: ScanResult;

        if (res.status === 200) {
          // T3: Success
          result = {
            id: crypto.randomUUID(),
            barcode: scannedBarcode.trim(),
            stageName,
            status: "success",
            message: data.warning
              ? `Registrado com aviso: ${data.warning}`
              : "Bipagem registrada com sucesso",
            lotId: data.scan_event?.lot_id,
            lotStatus: data.lot_status,
            warning: data.warning,
            timestamp: new Date(),
          };
          if (soundEnabled) beepSuccess();
          setSessionStats((p) => ({ ...p, total: p.total + 1, success: p.success + 1 }));
        } else if (res.status === 409) {
          // T3: Duplicate
          result = {
            id: crypto.randomUUID(),
            barcode: scannedBarcode.trim(),
            stageName,
            status: "warning",
            message: data.error || "Lote já bipado nesta etapa",
            timestamp: new Date(),
          };
          if (soundEnabled) beepWarning();
          setSessionStats((p) => ({ ...p, total: p.total + 1, warnings: p.warnings + 1 }));
        } else {
          // T3: Error (400, 404, 500)
          result = {
            id: crypto.randomUUID(),
            barcode: scannedBarcode.trim(),
            stageName,
            status: "destructive",
            message: data.error || "Erro ao processar bipagem",
            timestamp: new Date(),
          };
          if (soundEnabled) beepError();
          setSessionStats((p) => ({ ...p, total: p.total + 1, errors: p.errors + 1 }));
        }

        setLastResult(result);
        setHistory((prev) => [result, ...prev].slice(0, 20));
      } catch {
        const result: ScanResult = {
          id: crypto.randomUUID(),
          barcode: scannedBarcode.trim(),
          stageName,
          status: "destructive",
          message: "Erro de conexão com o servidor",
          timestamp: new Date(),
        };
        if (soundEnabled) beepError();
        setLastResult(result);
        setHistory((prev) => [result, ...prev].slice(0, 20));
        setSessionStats((p) => ({ ...p, total: p.total + 1, errors: p.errors + 1 }));
      } finally {
        setScanning(false);
        setBarcode("");
        // Re-focus input after scan
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    },
    [selectedStageId, scanning, stages, station, soundEnabled],
  );

  // T2: Handle key down (Enter to submit)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleScan(barcode);
      }
    },
    [barcode, handleScan],
  );

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Stages load error state
  if (stagesError) {
    return (
      <div className="space-y-4">
        <PageHeader eyebrow="Bipagem" title="Scan de Lotes" />
        <LisionCard>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <XCircle className="size-10 text-destructive/40 mb-3" strokeWidth={1.5} />
            <p className="text-[13px] text-muted-foreground mb-1">
              Erro ao carregar etapas de produção
            </p>
            <p className="text-[11px] text-muted-foreground/60 mb-4">
              Verifique a conexão com o banco de dados
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-foreground text-background text-[13px] font-medium hover:bg-foreground/90 transition-colors"
            >
              Tentar novamente
            </button>
          </div>
        </LisionCard>
      </div>
    );
  }

  const selectedStage = stages.find((s) => s.id === selectedStageId);

  return (
    <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-6 lg:py-8 space-y-4">
      {/* Header */}
      <PageHeader eyebrow="Bipagem" title="Scan de Lotes">
        <div className="flex items-center gap-2">
          {/* Sound toggle */}
          <button
            onClick={() => {
              // Initialize audio context on first user gesture
              getAudioContext();
              setSoundEnabled((p) => !p);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border/40 hover:bg-secondary/50 transition-colors"
            title={soundEnabled ? "Desativar som" : "Ativar som"}
          >
            {soundEnabled ? (
              <Volume2 className="size-4 text-muted-foreground" />
            ) : (
              <VolumeX className="size-4 text-muted-foreground" />
            )}
            <span className="text-xs text-muted-foreground">{soundEnabled ? "Som" : "Mudo"}</span>
          </button>
          {/* T5: Fullscreen toggle */}
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg border border-border/40 hover:bg-secondary/50 transition-colors"
            title={isFullscreen ? "Sair do fullscreen" : "Modo fullscreen"}
          >
            {isFullscreen ? (
              <Minimize2 className="size-4 text-muted-foreground" />
            ) : (
              <Maximize2 className="size-4 text-muted-foreground" />
            )}
          </button>
        </div>
      </PageHeader>

      {/* KPI Row */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
        className="grid grid-cols-2 md:grid-cols-5 gap-4"
      >
        <MetricBox label="Total Bipagens" value={String(sessionStats.total)} />
        <MetricBox label="Sucesso" value={String(sessionStats.success)} />
        <MetricBox label="Duplicados" value={String(sessionStats.warnings)} />
        <MetricBox label="Erros" value={String(sessionStats.errors)} />
        <MetricBox
          label="Etapa Atual"
          value={selectedStage ? (STAGE_LABELS[selectedStage.name] ?? selectedStage.name) : "—"}
          accent
        />
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Main scan area */}
        <motion.div
          className="lg:col-span-8"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        >
          <LisionCard>
            <LisionCardHeader eyebrow="Scanner" title="Bipagem de Código de Barras" />

            {/* Barcode input */}
            <div className="relative mb-4">
              <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Aguardando leitura do scanner..."
                className="w-full pl-10 pr-4 py-3 rounded-lg bg-secondary/30 border border-border/40 text-foreground font-mono text-sm tabular-nums placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground/20 transition-colors"
                autoFocus
                autoComplete="off"
                disabled={scanning || !selectedStageId}
              />
              {scanning && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 animate-spin text-muted-foreground" />
              )}
            </div>

            {/* Manual confirm button (fallback for scanner issues) */}
            <button
              onClick={() => handleScan(barcode)}
              disabled={!barcode.trim() || scanning || !selectedStageId}
              className="w-full py-2.5 rounded-lg bg-foreground text-background font-medium text-[13px] hover:bg-foreground/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors mb-4"
            >
              {scanning ? "Processando..." : "Confirmar Bipagem"}
            </button>

            {/* T3: Feedback panel */}
            <AnimatePresence mode="wait">
              {lastResult && (
                <motion.div
                  key={lastResult.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  className={`rounded-xl border p-4 ${
                    lastResult.status === "success"
                      ? "bg-success/10 border-success/20"
                      : lastResult.status === "warning"
                        ? "bg-warning/10 border-warning/20"
                        : "bg-destructive/10 border-destructive/20"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {lastResult.status === "success" && (
                        <CheckCircle2 className="size-5 text-success" />
                      )}
                      {lastResult.status === "warning" && (
                        <AlertTriangle className="size-5 text-warning" />
                      )}
                      {lastResult.status === "destructive" && (
                        <XCircle className="size-5 text-destructive" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm tabular-nums font-medium">
                          {lastResult.barcode}
                        </span>
                        <StatusBadge
                          status={lastResult.status}
                          icon={
                            lastResult.status === "success" ? (
                              <CheckCircle2 className="size-3" />
                            ) : lastResult.status === "warning" ? (
                              <AlertTriangle className="size-3" />
                            ) : (
                              <XCircle className="size-3" />
                            )
                          }
                        >
                          {lastResult.status === "success"
                            ? "OK"
                            : lastResult.status === "warning"
                              ? "DUPLICADO"
                              : "ERRO"}
                        </StatusBadge>
                      </div>
                      <p className="text-[13px] text-muted-foreground">{lastResult.message}</p>
                      {lastResult.lotStatus && (
                        <p className="text-[11px] font-mono text-muted-foreground mt-1">
                          Status do lote: {lastResult.lotStatus}
                        </p>
                      )}
                      {lastResult.warning && (
                        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-warning">
                          <AlertTriangle className="size-3" />
                          <span>Scan fora da ordem esperada</span>
                        </div>
                      )}
                      {lastResult.status === "success" && lastResult.lotId && (
                        <button
                          type="button"
                          onClick={() => setDefectModalOpen(true)}
                          className="mt-3 px-3 py-1.5 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-[12px] font-medium hover:bg-destructive/20 transition-colors flex items-center gap-1.5"
                        >
                          <AlertTriangle className="size-3" />
                          Reportar Defeito
                        </button>
                      )}
                    </div>
                    <span className="font-mono text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
                      {formatTime(lastResult.timestamp)}
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {!lastResult && !scanning && (
              <div className="rounded-xl border border-border/40 bg-secondary/20 p-8 text-center">
                <ScanLine className="size-10 text-muted-foreground/30 mx-auto mb-3" strokeWidth={1.5} />
                <p className="text-[13px] text-muted-foreground">
                  Selecione a etapa e escaneie um código de barras
                </p>
                <p className="text-[11px] text-muted-foreground/60 mt-1">
                  O scanner USB enviará o código automaticamente
                </p>
              </div>
            )}
          </LisionCard>
        </motion.div>

        {/* T1: Stage selector sidebar */}
        <motion.div
          className="lg:col-span-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        >
          <LisionCard>
            <LisionCardHeader eyebrow="Configuração" title="Etapa Atual" />
            <div className="space-y-1.5">
              {stages.map((stage, i) => (
                <motion.button
                  key={stage.id}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.03 * i, ease: [0.22, 1, 0.36, 1] }}
                  onClick={() => setSelectedStageId(stage.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                    selectedStageId === stage.id
                      ? "bg-foreground text-background"
                      : "hover:bg-secondary/50"
                  }`}
                >
                  <div
                    className={`flex items-center justify-center size-7 rounded-lg text-[11px] font-mono font-medium tabular-nums ${
                      selectedStageId === stage.id
                        ? "bg-background/20 text-background"
                        : "bg-secondary/50 text-muted-foreground"
                    }`}
                  >
                    {stage.order_index + 1}
                  </div>
                  <span className="text-[13px] font-medium">
                    {STAGE_LABELS[stage.name] ?? stage.name}
                  </span>
                </motion.button>
              ))}
            </div>

            {/* Station info */}
            {station && (
              <div className="mt-4 pt-4 border-t border-border/40">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  Estação
                </div>
                <div className="font-mono text-sm tabular-nums">{station}</div>
              </div>
            )}
          </LisionCard>
        </motion.div>
      </div>

      {/* T6: Scan history */}
      {history.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <LisionCard>
            <LisionCardHeader
              eyebrow="Sessão"
              title="Histórico de Bipagens"
              right={
                <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
                  {history.length} registro{history.length !== 1 ? "s" : ""}
                </span>
              }
            />

            {/* Header row */}
            <div className="grid grid-cols-12 gap-2 px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              <div className="col-span-4">Barcode</div>
              <div className="col-span-3">Etapa</div>
              <div className="col-span-2">Resultado</div>
              <div className="col-span-3 text-right">Hora</div>
            </div>

            <div className="space-y-1">
              {history.map((item, i) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: 0.03 * i, ease: [0.22, 1, 0.36, 1] }}
                  className="grid grid-cols-12 gap-2 items-center px-2 py-2 rounded-lg hover:bg-secondary/30 transition-colors"
                >
                  <div className="col-span-4 font-mono text-[12px] tabular-nums truncate">
                    {item.barcode}
                  </div>
                  <div className="col-span-3 text-[12px] text-muted-foreground truncate">
                    {STAGE_LABELS[item.stageName] ?? item.stageName}
                  </div>
                  <div className="col-span-2">
                    <StatusBadge status={item.status}>
                      {item.status === "success"
                        ? "OK"
                        : item.status === "warning"
                          ? "DUP"
                          : "ERR"}
                    </StatusBadge>
                  </div>
                  <div className="col-span-3 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                    {formatTime(item.timestamp)}
                  </div>
                </motion.div>
              ))}
            </div>
          </LisionCard>
        </motion.div>
      )}

      {/* Defect Modal */}
      {lastResult?.lotId && (
        <DefectModal
          lotId={lastResult.lotId}
          barcode={lastResult.barcode}
          open={defectModalOpen}
          onClose={() => setDefectModalOpen(false)}
          onSuccess={() => {
            setDefectModalOpen(false);
            setLastResult((prev) =>
              prev ? { ...prev, lotStatus: "IN_REWORK" } : prev
            );
          }}
        />
      )}
    </div>
  );
}

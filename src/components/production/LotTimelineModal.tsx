"use client";

import * as React from "react";
import { motion } from "motion/react";
import { X, Clock, Loader2, Play, Square } from "lucide-react";
import { LisionCard } from "@/components/ui/lision-card";

interface StageDuration {
  stage_id: string;
  started_at: string;
  ended_at: string | null;
  duration_hours: number | null;
  open: boolean;
}

interface ScanRow {
  id: string;
  stage_id: string | null;
  event_type: string;
  scanned_at: string;
}

interface LotTimelineModalProps {
  lotId: string;
  barcode: string;
  onClose: () => void;
}

function fmtHours(h: number): string {
  if (h >= 1) return `${h.toFixed(1)}h`;
  return `${Math.round(h * 60)}min`;
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Story 8.18 — Timeline de início/fim e duração por etapa de um lote */
function LotTimelineModal({ lotId, barcode, onClose }: LotTimelineModalProps) {
  const [loading, setLoading] = React.useState(true);
  const [durations, setDurations] = React.useState<StageDuration[]>([]);
  const [scans, setScans] = React.useState<ScanRow[]>([]);
  const [stageNames, setStageNames] = React.useState<Map<string, string>>(new Map());
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [lotRes, stagesRes] = await Promise.all([
          fetch(`/api/production/lots/${lotId}`),
          fetch(`/api/settings/stages`),
        ]);
        if (!lotRes.ok) throw new Error("Falha ao carregar o lote");
        const lotJson = await lotRes.json();
        const stagesJson = stagesRes.ok ? await stagesRes.json() : { data: [] };
        if (cancelled) return;

        const nameMap = new Map<string, string>(
          (stagesJson.data ?? []).map((s: { id: string; name: string; display_name?: string }) => [
            s.id,
            s.display_name || s.name,
          ]),
        );
        setStageNames(nameMap);
        setDurations(lotJson.stage_durations ?? []);
        setScans(lotJson.scan_history ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erro ao carregar");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [lotId]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg"
      >
        <LisionCard>
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80 mb-1.5 font-medium flex items-center gap-1.5">
                <Clock className="size-3" /> Tempos do Lote
              </div>
              <h3 className="text-[15px] font-semibold tracking-tight font-mono">{barcode}</h3>
            </div>
            <button
              onClick={onClose}
              className="size-8 rounded-lg bg-secondary/60 border border-border/60 grid place-items-center hover:bg-secondary transition"
            >
              <X className="size-4" />
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground gap-2 text-[13px]">
              <Loader2 className="size-4 animate-spin" /> Carregando...
            </div>
          ) : error ? (
            <div className="py-8 text-center text-[13px] text-destructive">{error}</div>
          ) : (
            <>
              {/* Duração por etapa */}
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                Duração por etapa
              </div>
              {durations.length === 0 ? (
                <p className="text-[13px] text-muted-foreground py-3">
                  Nenhuma etapa com início bipado ainda.
                </p>
              ) : (
                <div className="space-y-2 mb-5">
                  {durations.map((d, i) => (
                    <div
                      key={`${d.stage_id}-${i}`}
                      className="flex items-center justify-between p-2.5 rounded-lg border border-border/40 bg-secondary/20"
                    >
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium truncate">
                          {stageNames.get(d.stage_id) || "Etapa"}
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          {fmtDateTime(d.started_at)}
                          {d.ended_at ? ` → ${fmtDateTime(d.ended_at)}` : " → em andamento"}
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        {d.open ? (
                          <span className="text-[11px] px-2 py-0.5 rounded-md bg-warning/10 text-warning border border-warning/20">
                            em aberto
                          </span>
                        ) : (
                          <span className="font-mono text-[13px] tabular-nums font-semibold">
                            {d.duration_hours != null ? fmtHours(d.duration_hours) : "—"}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Histórico bruto de bipagens */}
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                Bipagens registradas
              </div>
              {scans.length === 0 ? (
                <p className="text-[13px] text-muted-foreground py-2">Nenhuma bipagem.</p>
              ) : (
                <div className="space-y-1 max-h-[180px] overflow-y-auto">
                  {scans.map((s) => {
                    const isOut = s.event_type === "STAGE_OUT";
                    return (
                      <div key={s.id} className="flex items-center gap-2 text-[12px] py-1">
                        {isOut ? (
                          <Square className="size-3 text-sky-500 shrink-0" />
                        ) : (
                          <Play className="size-3 text-emerald-500 shrink-0" />
                        )}
                        <span className="text-muted-foreground">
                          {isOut ? "Fim" : "Início"}
                        </span>
                        <span className="font-medium truncate">
                          {s.stage_id ? stageNames.get(s.stage_id) || "—" : "—"}
                        </span>
                        <span className="ml-auto font-mono text-[11px] text-muted-foreground tabular-nums">
                          {fmtDateTime(s.scanned_at)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </LisionCard>
      </motion.div>
    </motion.div>
  );
}

export { LotTimelineModal };

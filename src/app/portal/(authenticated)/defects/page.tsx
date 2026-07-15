"use client";
import { formatDateBR } from "@/lib/tz";

import { useCallback, useEffect, useState } from "react";
import { PullToRefresh } from "@/components/portal/PullToRefresh";

interface Defect {
  id: string;
  defect_type: string;
  severity: string;
  description: string | null;
  photo_url: string | null;
  quantity: number;
  detected_at: string;
  faction_response: string | null;
  faction_response_at: string | null;
  contestation_reason: string | null;
  lots: { barcode: string };
}

export default function PortalDefectsPage() {
  const [defects, setDefects] = useState<Defect[]>([]);
  const [loading, setLoading] = useState(true);
  const [contestModal, setContestModal] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ id: string; msg: string; ok: boolean } | null>(null);

  const load = useCallback(
    () =>
      fetch("/api/faction/defects")
        .then((r) => {
          if (!r.ok) throw new Error("Fetch failed");
          return r.json();
        })
        .then((data) => setDefects(data.data || []))
        .catch(() => {}),
    [],
  );

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function handleRespond(defectId: string, response: "CONFIRMED" | "CONTESTED") {
    setSubmitting(true);
    setFeedback(null);
    try {
      const body: Record<string, string> = { response };
      if (response === "CONTESTED") body.reason = reason;

      const res = await fetch(`/api/faction/defects/${defectId}/respond`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setDefects((prev) =>
          prev.map((d) =>
            d.id === defectId
              ? { ...d, faction_response: response, faction_response_at: data.respondedAt, contestation_reason: reason || null }
              : d
          )
        );
        setFeedback({ id: defectId, msg: response === "CONFIRMED" ? "Confirmado." : "Contestação enviada.", ok: true });
        setContestModal(null);
        setReason("");
      } else {
        setFeedback({ id: defectId, msg: data.message || data.error, ok: false });
      }
    } catch {
      setFeedback({ id: defectId, msg: "Erro de conexão.", ok: false });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingSkeleton />;

  const SEVERITY_COLORS: Record<string, string> = {
    LEVE: "text-emerald-400",
    MEDIO: "text-amber-400",
    GRAVE: "text-red-400",
  };

  const pendingResponse = defects.filter((d) => !d.faction_response).length;
  const totalPieces = defects.reduce((sum, d) => sum + d.quantity, 0);

  return (
    <PullToRefresh onRefresh={load}>
    <div className="space-y-4">
      <h2 className="font-display text-[20px] font-semibold">Defeitos</h2>

      {/* Summary KPIs — always visible */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-[12px] text-muted-foreground">Registros</p>
          <p className="mt-1 font-display text-[24px] font-bold tabular-nums">{defects.length}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-[12px] text-muted-foreground">Peças</p>
          <p className="mt-1 font-display text-[24px] font-bold tabular-nums">{totalPieces}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-[12px] text-muted-foreground">Pendentes</p>
          <p className="mt-1 font-display text-[24px] font-bold tabular-nums text-amber-400">{pendingResponse}</p>
        </div>
      </div>

      {defects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-emerald-500/30 bg-emerald-500/5 p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
            <svg className="h-6 w-6 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <p className="text-[15px] font-medium text-emerald-400">Tudo certo!</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Nenhum defeito registrado nos seus lotes. Continue assim!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {defects.map((d) => (
            <div key={d.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold">
                    {d.defect_type} ·{" "}
                    <span className={SEVERITY_COLORS[d.severity] || ""}>{d.severity}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Lote {d.lots?.barcode} · {d.quantity} peça{d.quantity > 1 ? "s" : ""} ·{" "}
                    {formatDateBR(d.detected_at)}
                  </p>
                </div>
                {d.faction_response && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      d.faction_response === "CONFIRMED"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-red-500/20 text-red-400"
                    }`}
                  >
                    {d.faction_response === "CONFIRMED" ? "Confirmado" : "Contestado"}
                  </span>
                )}
              </div>

              {d.description && (
                <p className="mt-2 text-xs text-muted-foreground">{d.description}</p>
              )}

              {d.contestation_reason && (
                <p className="mt-2 text-xs text-amber-400">
                  Motivo: {d.contestation_reason}
                </p>
              )}

              {feedback?.id === d.id && (
                <p className={`mt-2 text-xs ${feedback.ok ? "text-emerald-400" : "text-red-400"}`}>
                  {feedback.msg}
                </p>
              )}

              {/* Actions — only if no response yet */}
              {!d.faction_response && (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => handleRespond(d.id, "CONFIRMED")}
                    disabled={submitting}
                    className="flex-1 min-h-[48px] rounded-lg border border-emerald-600 px-3 text-[15px] font-medium text-emerald-400 transition-colors active:bg-emerald-500/10 disabled:opacity-50"
                  >
                    Confirmar
                  </button>
                  <button
                    onClick={() => setContestModal(d.id)}
                    disabled={submitting}
                    className="flex-1 min-h-[48px] rounded-lg border border-red-600 px-3 text-[15px] font-medium text-red-400 transition-colors active:bg-red-500/10 disabled:opacity-50"
                  >
                    Contestar
                  </button>
                </div>
              )}

              {/* Contest modal inline */}
              {contestModal === d.id && (
                <div className="mt-3 space-y-2 rounded border border-border bg-background p-3">
                  <p className="text-sm font-medium">Motivo da contestação</p>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Descreva por que discorda deste defeito..."
                    rows={3}
                    className="w-full rounded border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleRespond(d.id, "CONTESTED")}
                      disabled={!reason.trim() || submitting}
                      className="flex-1 min-h-[48px] rounded-lg bg-red-600 px-3 text-[15px] font-medium text-white disabled:opacity-50"
                    >
                      {submitting ? "Enviando..." : "Enviar contestação"}
                    </button>
                    <button
                      onClick={() => { setContestModal(null); setReason(""); }}
                      className="min-h-[48px] rounded-lg border border-border px-4 text-[15px] text-muted-foreground"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
    </PullToRefresh>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-6 w-40 animate-pulse rounded bg-muted" />
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-28 animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

interface ReturnItem {
  id: string;
  status: string;
  quantity_sent: number;
  expected_return_at: string;
  faction_estimated_return: string | null;
  reschedule_count: number;
  lots: { barcode: string; production_orders: { product_name: string } };
}

export default function PortalReturnsPage() {
  const [returns, setReturns] = useState<ReturnItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newDate, setNewDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ id: string; msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/faction/returns")
      .then((r) => r.json())
      .then((data) => setReturns(data.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function handleEstimate(shipmentId: string) {
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/faction/returns/${shipmentId}/estimate`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estimatedReturn: newDate }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback({ id: shipmentId, msg: "Previsão informada!", ok: true });
        setReturns((prev) =>
          prev.map((r) =>
            r.id === shipmentId
              ? { ...r, faction_estimated_return: newDate, reschedule_count: data.rescheduleCount }
              : r
          )
        );
        setSelectedId(null);
        setNewDate("");
      } else {
        setFeedback({ id: shipmentId, msg: data.message || data.error, ok: false });
      }
    } catch {
      setFeedback({ id: shipmentId, msg: "Erro de conexão.", ok: false });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-semibold">Devoluções pendentes</h2>

      {returns.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">
          Nenhuma devolução pendente.
        </p>
      ) : (
        <div className="space-y-3">
          {returns.map((r) => {
            const isOverdue = r.status === "OVERDUE";
            const canReschedule = r.reschedule_count < 2;
            return (
              <div
                key={r.id}
                className={`rounded-lg border p-4 ${
                  isOverdue ? "border-red-500/30 bg-red-500/5" : "border-border bg-card"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold">{r.lots?.barcode}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.lots?.production_orders?.product_name} · {r.quantity_sent} peças
                    </p>
                  </div>
                  {isOverdue && (
                    <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-medium text-red-400">
                      Atrasado
                    </span>
                  )}
                </div>

                <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                  <span>Prazo: {new Date(r.expected_return_at).toLocaleDateString("pt-BR")}</span>
                  {r.faction_estimated_return && (
                    <span>Previsão: {new Date(r.faction_estimated_return).toLocaleDateString("pt-BR")}</span>
                  )}
                </div>

                {r.reschedule_count > 0 && (
                  <p className="mt-1 text-xs text-amber-400">
                    {r.reschedule_count}x reagendado
                  </p>
                )}

                {feedback?.id === r.id && (
                  <p className={`mt-2 text-xs ${feedback.ok ? "text-emerald-400" : "text-red-400"}`}>
                    {feedback.msg}
                  </p>
                )}

                {canReschedule ? (
                  selectedId === r.id ? (
                    <div className="mt-3 flex gap-2">
                      <input
                        type="date"
                        value={newDate}
                        onChange={(e) => setNewDate(e.target.value)}
                        min={new Date(Date.now() + 86400000).toISOString().split("T")[0]}
                        className="flex-1 rounded border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                      />
                      <button
                        onClick={() => handleEstimate(r.id)}
                        disabled={!newDate || submitting}
                        className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                      >
                        {submitting ? "..." : "OK"}
                      </button>
                      <button
                        onClick={() => { setSelectedId(null); setNewDate(""); }}
                        className="rounded border border-border px-3 py-2 text-sm text-muted-foreground"
                      >
                        X
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setSelectedId(r.id)}
                      className="mt-3 w-full rounded border border-border px-4 py-2 text-sm text-foreground transition-colors active:bg-accent"
                    >
                      {r.faction_estimated_return ? "Reagendar devolução" : "Informar previsão"}
                    </button>
                  )
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Limite de reagendamentos atingido. Entre em contato com a Liserie.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-6 w-40 animate-pulse rounded bg-muted" />
      {[...Array(2)].map((_, i) => (
        <div key={i} className="h-32 animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  );
}

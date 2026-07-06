"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PullToRefresh } from "@/components/portal/PullToRefresh";

interface Shipment {
  id: string;
  status: string;
  quantity_sent: number;
  quantity_returned: number | null;
  sent_at: string;
  expected_return_at: string;
  faction_confirmed_at: string | null;
  faction_estimated_return: string | null;
  reschedule_count: number;
  released_value: number | null;
  retained_value: number | null;
  closed_at: string | null;
  lots: { barcode: string; lot_number: string; production_orders: { op_number: string; product_name: string } };
}

const STATUS_COLORS: Record<string, string> = {
  SENT: "bg-amber-500",
  RECEIVED_BY_FACTION: "bg-emerald-500",
  PARTIALLY_RETURNED: "bg-blue-500",
  OVERDUE: "bg-red-500",
  PREPARING: "bg-muted-foreground",
  RETURNED: "bg-muted-foreground",
  CLOSED: "bg-emerald-500",
};

const STATUS_LABELS: Record<string, string> = {
  SENT: "Enviado",
  RECEIVED_BY_FACTION: "Recebido",
  PARTIALLY_RETURNED: "Parcial",
  OVERDUE: "Atrasado",
  PREPARING: "Preparando",
  RETURNED: "Devolvido",
  CLOSED: "Encerrada",
};

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function PortalShipmentsPage() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"active" | "history">("active");

  const load = useCallback(
    () =>
      fetch(`/api/faction/shipments${view === "history" ? "?view=history" : ""}`)
        .then((r) => {
          if (!r.ok) throw new Error("Fetch failed");
          return r.json();
        })
        .then((data) => setShipments(data.data || []))
        .catch(() => {}),
    [view],
  );

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
    // F4: polling silencioso 3s — encerramentos/transições refletem sem piscar
    // (o load de fundo não toca em `loading`).
    const t = setInterval(() => load(), 3000);
    return () => clearInterval(t);
  }, [load]);

  if (loading) return <LoadingSkeleton />;

  const totalPieces =
    view === "history"
      ? shipments.reduce((sum, s) => sum + (s.quantity_returned || 0), 0)
      : shipments.reduce((sum, s) => sum + s.quantity_sent, 0);
  const pendingConfirm =
    view === "history" ? 0 : shipments.filter((s) => s.status === "SENT" && !s.faction_confirmed_at).length;

  return (
    <PullToRefresh onRefresh={load}>
    <div className="space-y-4">
      <h2 className="font-display text-[20px] font-semibold">Remessas</h2>

      {/* F2: toggle Ativas / Histórico (encerradas ficam consultáveis) */}
      <div className="flex gap-2">
        {([["active", "Ativas"], ["history", "Histórico"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`min-h-[40px] rounded-full px-4 text-[13px] font-medium transition-colors ${
              view === key
                ? "bg-foreground text-background"
                : "border border-border bg-card text-muted-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Summary KPIs — always visible */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-[13px] text-muted-foreground">
            {view === "history" ? "Remessas devolvidas" : "Lotes ativos"}
          </p>
          <p className="mt-1 font-display text-[28px] font-bold tabular-nums">{shipments.length}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-[13px] text-muted-foreground">
            {view === "history" ? "Peças devolvidas" : "Peças com você"}
          </p>
          <p className="mt-1 font-display text-[28px] font-bold tabular-nums">{totalPieces.toLocaleString("pt-BR")}</p>
        </div>
      </div>

      {pendingConfirm > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-[14px] font-medium text-amber-400">
            {pendingConfirm} remessa{pendingConfirm > 1 ? "s" : ""} aguardando confirmação
          </p>
        </div>
      )}

      {/* List or empty state */}
      {shipments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <svg className="h-6 w-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
            </svg>
          </div>
          <p className="text-[15px] font-medium">
            {view === "history" ? "Nenhuma remessa no histórico" : "Nenhuma remessa ativa"}
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {view === "history"
              ? "Remessas devolvidas e encerradas aparecerão aqui."
              : "Quando a Liserie enviar lotes para você, eles aparecerão aqui."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {shipments.map((s) => (
            <Link
              key={s.id}
              href={`/portal/shipments/${s.id}`}
              className="block rounded-xl border border-border bg-card p-4 transition-colors active:bg-accent"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[14px] font-semibold">
                    {s.lots?.barcode || "—"}
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    {s.lots?.production_orders?.product_name || "—"} · OP {s.lots?.production_orders?.op_number || "—"}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${STATUS_COLORS[s.status] || "bg-muted-foreground"}`} />
                  <span className="text-[12px] text-muted-foreground">
                    {STATUS_LABELS[s.status] || s.status}
                  </span>
                </div>
              </div>
              <div className="mt-2 flex gap-4 text-[12px] text-muted-foreground">
                <span>{s.quantity_sent} peças</span>
                <span>Prazo: {new Date(s.expected_return_at).toLocaleDateString("pt-BR")}</span>
              </div>
              {!s.faction_confirmed_at && s.status === "SENT" && (
                <p className="mt-2 text-[12px] font-medium text-amber-400">
                  Aguardando confirmação de recebimento
                </p>
              )}
              {view === "history" && (
                <p className="mt-2 text-[12px] text-muted-foreground">
                  Liberado: <span className="font-medium text-emerald-400">{brl(Number(s.released_value || 0))}</span>
                  {Number(s.retained_value || 0) > 0 && (
                    <> · Retido: <span className="font-medium text-amber-400">{brl(Number(s.retained_value || 0))}</span></>
                  )}
                  {s.closed_at && <> · Encerrada em {new Date(s.closed_at).toLocaleDateString("pt-BR")}</>}
                </p>
              )}
            </Link>
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
      <div className="h-6 w-32 animate-pulse rounded bg-muted" />
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  );
}

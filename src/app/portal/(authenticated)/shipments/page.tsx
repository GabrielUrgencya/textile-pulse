"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Shipment {
  id: string;
  status: string;
  quantity_sent: number;
  sent_at: string;
  expected_return_at: string;
  faction_confirmed_at: string | null;
  faction_estimated_return: string | null;
  reschedule_count: number;
  lots: { barcode: string; lot_number: string; production_orders: { op_number: string; product_name: string } };
}

const STATUS_COLORS: Record<string, string> = {
  SENT: "bg-amber-500",
  RECEIVED_BY_FACTION: "bg-emerald-500",
  PARTIALLY_RETURNED: "bg-blue-500",
  OVERDUE: "bg-red-500",
  PREPARING: "bg-muted-foreground",
};

const STATUS_LABELS: Record<string, string> = {
  SENT: "Enviado",
  RECEIVED_BY_FACTION: "Recebido",
  PARTIALLY_RETURNED: "Parcial",
  OVERDUE: "Atrasado",
  PREPARING: "Preparando",
  RETURNED: "Devolvido",
};

export default function PortalShipmentsPage() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/faction/shipments")
      .then((r) => r.json())
      .then((data) => setShipments(data.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton />;

  const totalPieces = shipments.reduce((sum, s) => sum + s.quantity_sent, 0);
  const pendingConfirm = shipments.filter((s) => s.status === "SENT" && !s.faction_confirmed_at).length;

  return (
    <div className="space-y-4">
      <h2 className="font-display text-[20px] font-semibold">Remessas</h2>

      {/* Summary KPIs — always visible */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-[13px] text-muted-foreground">Lotes ativos</p>
          <p className="mt-1 font-display text-[28px] font-bold tabular-nums">{shipments.length}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-[13px] text-muted-foreground">Peças com você</p>
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
          <p className="text-[15px] font-medium">Nenhuma remessa ativa</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Quando a Liserie enviar lotes para você, eles aparecerão aqui.
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
            </Link>
          ))}
        </div>
      )}
    </div>
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

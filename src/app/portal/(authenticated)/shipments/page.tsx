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

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-semibold">Lotes com você</h2>

      {shipments.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">
          Nenhum lote no momento.
        </p>
      ) : (
        <div className="space-y-3">
          {shipments.map((s) => (
            <Link
              key={s.id}
              href={`/portal/shipments/${s.id}`}
              className="block rounded-lg border border-border bg-card p-4 transition-colors active:bg-accent"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold">
                    {s.lots?.barcode || "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.lots?.production_orders?.product_name || "—"} · OP {s.lots?.production_orders?.op_number || "—"}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${STATUS_COLORS[s.status] || "bg-muted-foreground"}`} />
                  <span className="text-xs text-muted-foreground">
                    {STATUS_LABELS[s.status] || s.status}
                  </span>
                </div>
              </div>
              <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                <span>{s.quantity_sent} peças</span>
                <span>Prazo: {new Date(s.expected_return_at).toLocaleDateString("pt-BR")}</span>
              </div>
              {!s.faction_confirmed_at && s.status === "SENT" && (
                <p className="mt-2 text-xs font-medium text-amber-400">
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

"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function ShipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [shipment, setShipment] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    fetch(`/api/faction/shipments/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setShipment)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  async function handleConfirm() {
    setConfirming(true);
    try {
      const res = await fetch(`/api/faction/shipments/${id}/confirm`, {
        method: "PATCH",
      });
      if (res.ok) {
        const updated = await res.json();
        setShipment((prev) => prev ? { ...prev, faction_confirmed_at: updated.confirmedAt, status: "RECEIVED_BY_FACTION" } : prev);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setConfirming(false);
    }
  }

  if (loading) return <div className="h-48 animate-pulse rounded-lg bg-muted" />;
  if (!shipment) return <p className="text-center text-muted-foreground">Lote não encontrado.</p>;

  const lots = shipment.lots as Record<string, unknown> | undefined;
  const po = lots?.production_orders as Record<string, string> | undefined;

  return (
    <div className="space-y-4">
      <button
        onClick={() => router.back()}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Voltar
      </button>

      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">
            {(lots?.barcode as string) || "—"}
          </h2>
          <StatusBadge status={shipment.status as string} />
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <InfoItem label="Produto" value={po?.product_name || "—"} />
          <InfoItem label="OP" value={po?.op_number || "—"} />
          <InfoItem label="Peças enviadas" value={String(shipment.quantity_sent)} />
          <InfoItem label="Prazo" value={formatDate(shipment.expected_return_at as string)} />
          <InfoItem label="Enviado em" value={formatDate(shipment.sent_at as string)} />
          <InfoItem
            label="Confirmado em"
            value={shipment.faction_confirmed_at ? formatDate(shipment.faction_confirmed_at as string) : "Pendente"}
          />
        </div>

        {shipment.faction_estimated_return ? (
          <div className="rounded bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">Previsão de devolução</p>
            <p className="text-sm font-semibold">
              {formatDate(shipment.faction_estimated_return as string)}
              {(shipment.reschedule_count as number) > 0 && (
                <span className="ml-2 text-xs text-amber-400">
                  ({String(shipment.reschedule_count)}x reagendado)
                </span>
              )}
            </p>
          </div>
        ) : null}
      </div>

      {/* Confirm action */}
      {shipment.status === "SENT" && !shipment.faction_confirmed_at && (
        <button
          onClick={handleConfirm}
          disabled={confirming}
          className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
        >
          {confirming ? "Confirmando..." : "Confirmar recebimento"}
        </button>
      )}

      {/* Defects */}
      {Array.isArray(shipment.defect_records) && (shipment.defect_records as unknown[]).length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Defeitos registrados</h3>
          {(shipment.defect_records as Record<string, unknown>[]).map((d) => (
            <div key={d.id as string} className="rounded-lg border border-border bg-card p-3 text-sm">
              <div className="flex items-center justify-between">
                <span>{d.defect_type as string} · {d.severity as string}</span>
                <span className="text-xs text-muted-foreground">
                  {d.faction_response ? (d.faction_response as string) : "Sem resposta"}
                </span>
              </div>
              {d.description ? <p className="mt-1 text-xs text-muted-foreground">{d.description as string}</p> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    SENT: "bg-amber-500/20 text-amber-400",
    RECEIVED_BY_FACTION: "bg-emerald-500/20 text-emerald-400",
    OVERDUE: "bg-red-500/20 text-red-400",
    PARTIALLY_RETURNED: "bg-blue-500/20 text-blue-400",
  };
  const labels: Record<string, string> = {
    SENT: "Enviado",
    RECEIVED_BY_FACTION: "Recebido",
    OVERDUE: "Atrasado",
    PARTIALLY_RETURNED: "Parcial",
    RETURNED: "Devolvido",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[status] || "bg-muted text-muted-foreground"}`}>
      {labels[status] || status}
    </span>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

function vibrate() {
  try { navigator?.vibrate?.(50); } catch { /* silent fallback */ }
}

interface ShipmentData {
  id: string;
  status: string;
  quantity_sent: number;
  sent_at: string;
  expected_return_at: string;
  faction_confirmed_at: string | null;
  faction_estimated_return: string | null;
  reschedule_count: number;
  lots?: {
    barcode: string;
    lot_number?: string;
    quantity?: number;
    production_orders?: { op_number: string; product_name: string };
  };
  defect_records?: Array<{
    id: string;
    defect_type: string;
    severity: string;
    description: string | null;
    faction_response: string | null;
  }>;
}

const STATUS_LABELS: Record<string, string> = {
  SENT: "Enviado",
  RECEIVED_BY_FACTION: "Recebido",
  OVERDUE: "Atrasado",
  PARTIALLY_RETURNED: "Parcial",
  RETURNED: "Devolvido",
};

const STATUS_COLORS: Record<string, string> = {
  SENT: "bg-warning/20 text-warning",
  RECEIVED_BY_FACTION: "bg-success/20 text-success",
  OVERDUE: "bg-destructive/20 text-destructive",
  PARTIALLY_RETURNED: "bg-blue-500/20 text-blue-400",
  RETURNED: "bg-muted text-muted-foreground",
};

export default function ShipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [shipment, setShipment] = useState<ShipmentData | null>(null);
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
    vibrate();
    setConfirming(true);
    try {
      const res = await fetch(`/api/faction/shipments/${id}/confirm`, { method: "PATCH" });
      if (res.ok) {
        const updated = await res.json();
        setShipment((prev) => prev ? { ...prev, faction_confirmed_at: updated.confirmedAt, status: "RECEIVED_BY_FACTION" } : prev);
      }
    } catch { /* silent */ }
    finally { setConfirming(false); }
  }

  if (loading) return <div className="space-y-4"><div className="h-48 animate-pulse rounded-2xl bg-muted" /></div>;
  if (!shipment) return <p className="text-center text-[16px] text-muted-foreground py-12">Remessa não encontrada.</p>;

  const lot = shipment.lots;
  const po = lot?.production_orders;
  const isNearDeadline = shipment.expected_return_at && !shipment.faction_confirmed_at &&
    (new Date(shipment.expected_return_at).getTime() - Date.now()) < 48 * 3_600_000;

  return (
    <div className="space-y-5">
      <button onClick={() => router.back()} className="text-[14px] text-muted-foreground active:text-foreground">
        ← Voltar
      </button>

      {/* Header card */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[20px] font-bold">{lot?.barcode || "Remessa"}</h2>
          <span className={`rounded-full px-3 py-1 text-[12px] font-medium ${STATUS_COLORS[shipment.status] || "bg-muted text-muted-foreground"}`}>
            {STATUS_LABELS[shipment.status] || shipment.status}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-[14px]">
          <InfoItem label="Produto" value={po?.product_name || "—"} />
          <InfoItem label="OP" value={po?.op_number || "—"} />
          <InfoItem label="Peças" value={String(shipment.quantity_sent)} />
          <InfoItem label="Prazo" value={formatDate(shipment.expected_return_at)} />
        </div>
      </div>

      {/* Timeline */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="text-[14px] text-muted-foreground mb-4">Linha do tempo</p>
        <Timeline shipment={shipment} />
      </div>

      {/* Lot card */}
      {lot && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-[14px] text-muted-foreground mb-2">Lote</p>
          <p className="text-[16px] font-semibold font-mono">{lot.barcode}</p>
          {lot.quantity && <p className="text-[14px] text-muted-foreground mt-1">{lot.quantity} peças</p>}
        </div>
      )}

      {/* Actions */}
      {shipment.status === "SENT" && !shipment.faction_confirmed_at && (
        <button
          onClick={handleConfirm}
          disabled={confirming}
          className="w-full h-[48px] rounded-xl bg-success text-success-foreground text-[16px] font-semibold transition-opacity active:opacity-80 disabled:opacity-50"
        >
          {confirming ? "Confirmando..." : "Confirmar Recebimento"}
        </button>
      )}

      {isNearDeadline && shipment.status !== "RETURNED" && (
        <button
          className="w-full h-[48px] rounded-xl border-2 border-warning text-warning text-[16px] font-semibold transition-opacity active:opacity-80"
          onClick={vibrate}
        >
          Informar Atraso
        </button>
      )}

      {/* Defects */}
      {Array.isArray(shipment.defect_records) && shipment.defect_records.length > 0 && (
        <div className="space-y-3">
          <p className="text-[16px] font-semibold">Defeitos registrados</p>
          {shipment.defect_records.map((d) => (
            <div key={d.id} className="rounded-xl border border-border bg-card p-4 text-[14px]">
              <div className="flex items-center justify-between">
                <span className="font-medium">{d.defect_type} · {d.severity}</span>
                <span className="text-[12px] text-muted-foreground">
                  {d.faction_response || "Sem resposta"}
                </span>
              </div>
              {d.description && <p className="mt-1 text-[14px] text-muted-foreground">{d.description}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Timeline({ shipment }: { shipment: ShipmentData }) {
  const steps = [
    { label: "Enviado", date: shipment.sent_at, done: true },
    { label: "Recebido", date: shipment.faction_confirmed_at, done: !!shipment.faction_confirmed_at },
    { label: "Devolvido", date: shipment.status === "RETURNED" ? "Concluído" : null, done: shipment.status === "RETURNED" },
  ];

  return (
    <div className="relative pl-6 space-y-5">
      {steps.map((step, i) => (
        <div key={step.label} className="relative">
          {/* Vertical line */}
          {i < steps.length - 1 && (
            <div className={`absolute left-[-18px] top-6 w-0.5 h-[calc(100%+8px)] ${step.done ? "bg-success" : "bg-border"}`} />
          )}
          {/* Dot */}
          <div className={`absolute left-[-22px] top-1 size-3 rounded-full border-2 ${step.done ? "bg-success border-success" : "bg-background border-border"}`} />
          <div>
            <p className={`text-[16px] font-medium ${step.done ? "text-foreground" : "text-muted-foreground"}`}>{step.label}</p>
            {step.date && (
              <p className="text-[12px] text-muted-foreground mt-0.5">
                {step.date === "Concluído" ? step.date : formatDate(step.date)}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[12px] text-muted-foreground">{label}</p>
      <p className="text-[16px] font-medium">{value}</p>
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

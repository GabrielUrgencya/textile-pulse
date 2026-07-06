"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PackageCheck, Undo2 } from "lucide-react";
import { DeliveryCodeInput } from "@/components/shipments/DeliveryCodeInput";
import { DeliveryCodeDisplay } from "@/components/shipments/DeliveryCodeDisplay";

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
  return_code?: string | null;
  return_code_expires_at?: string | null;
  declared_ok?: number | null;
  declared_defect?: number | null;
  reconciliation_status?: string | null;
  shortage_qty?: number | null;
  released_value?: number | null;
  retained_value?: number | null;
  payment_status?: string | null;
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
  RETURN_DECLARED: "Devolução declarada",
  OVERDUE: "Atrasado",
  PARTIALLY_RETURNED: "Parcial",
  RETURNED: "Devolvido",
  CLOSED: "Encerrada",
};

const STATUS_COLORS: Record<string, string> = {
  SENT: "bg-warning/20 text-warning",
  RECEIVED_BY_FACTION: "bg-success/20 text-success",
  RETURN_DECLARED: "bg-warning/20 text-warning",
  OVERDUE: "bg-destructive/20 text-destructive",
  PARTIALLY_RETURNED: "bg-blue-500/20 text-blue-400",
  RETURNED: "bg-muted text-muted-foreground",
  CLOSED: "bg-success/20 text-success",
};

const SEVERITY_TEXT: Record<string, string> = {
  LEVE: "text-success",
  MEDIO: "text-warning",
  GRAVE: "text-destructive",
};
const SEVERITY_LABEL: Record<string, string> = {
  LEVE: "Leve",
  MEDIO: "Médio",
  GRAVE: "Grave",
};

export default function ShipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [shipment, setShipment] = useState<ShipmentData | null>(null);
  const [loading, setLoading] = useState(true);
  // Declaração de devolução
  const [declaring, setDeclaring] = useState(false);
  const [declareForm, setDeclareForm] = useState(false);
  const [declOk, setDeclOk] = useState("");
  const [declDefect, setDeclDefect] = useState("");
  const [declDate, setDeclDate] = useState("");
  const [declError, setDeclError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = (initial: boolean) =>
      fetch(`/api/faction/shipments/${id}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => { if (alive && json) setShipment(json); })
        .catch(console.error)
        .finally(() => { if (alive && initial) setLoading(false); });

    load(true);
    // Polling silencioso (<3s): reflete conferência/pagamento sem refresh.
    const t = setInterval(() => load(false), 3000);
    return () => { alive = false; clearInterval(t); };
  }, [id]);

  // Confirma o recebimento com o código de entrega fornecido pelo motorista.
  // Retorna o formato que o DeliveryCodeInput espera ({ success, error? }).
  async function handleConfirmCode(code: string): Promise<{ success: boolean; error?: string }> {
    vibrate();
    try {
      const res = await fetch(`/api/faction/shipments/${id}/confirm`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryCode: code }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setShipment((prev) => prev ? { ...prev, faction_confirmed_at: data.confirmedAt, status: "RECEIVED_BY_FACTION" } : prev);
        return { success: true };
      }
      return { success: false, error: data.message || data.error || "Não foi possível confirmar." };
    } catch {
      return { success: false, error: "Falha de conexão. Tente novamente." };
    }
  }

  // Declara a devolução (peças boas/defeito + data) → gera o código de devolução.
  async function handleDeclareReturn() {
    setDeclError(null);
    const ok = Number(declOk || 0);
    const defect = Number(declDefect || 0);
    if (!declDate) { setDeclError("Informe a data estimada de devolução."); return; }
    if (ok + defect <= 0) { setDeclError("Informe ao menos 1 peça a devolver."); return; }
    if (shipment && ok + defect > shipment.quantity_sent) {
      setDeclError(`Não pode devolver mais que ${shipment.quantity_sent} peças.`); return;
    }
    setDeclaring(true);
    vibrate();
    try {
      const res = await fetch(`/api/faction/shipments/${id}/declare-return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok, defect, estimatedDate: declDate }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setShipment((prev) => prev ? {
          ...prev,
          status: "RETURN_DECLARED",
          declared_ok: ok,
          declared_defect: defect,
          return_code: data.returnCode,
          return_code_expires_at: data.expiresAt,
          faction_estimated_return: declDate,
        } : prev);
        setDeclareForm(false);
      } else {
        setDeclError(data.message || data.error || "Não foi possível declarar a devolução.");
      }
    } catch {
      setDeclError("Falha de conexão. Tente novamente.");
    } finally {
      setDeclaring(false);
    }
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

      {/* Financeiro — valor real a receber (após conferência; CLOSED = resumo no histórico) */}
      {["RETURNED", "PARTIALLY_RETURNED", "CLOSED"].includes(shipment.status) && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-[14px] text-muted-foreground mb-2">Pagamento</p>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[12px] text-muted-foreground">A receber</p>
              <p className="text-[24px] font-bold tabular-nums text-success">
                R$ {Number(shipment.released_value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
            </div>
            {Number(shipment.retained_value || 0) > 0 && (
              <div className="text-right">
                <p className="text-[12px] text-muted-foreground">Retido</p>
                <p className="text-[16px] font-semibold tabular-nums text-warning">
                  R$ {Number(shipment.retained_value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
              </div>
            )}
          </div>
          {shipment.payment_status === "PAID" && (
            <p className="mt-2 text-[12px] text-success">Pago ✓</p>
          )}
          {Number(shipment.retained_value || 0) > 0 && (
            <p className="mt-2 text-[12px] text-muted-foreground">Valor retido até a resolução dos defeitos.</p>
          )}
        </div>
      )}

      {/* Actions — confirmar recebimento exige o código de entrega do motorista */}
      {shipment.status === "SENT" && !shipment.faction_confirmed_at && (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
          <div className="flex flex-col items-center text-center gap-2">
            <div className="size-11 rounded-full bg-success/10 grid place-items-center">
              <PackageCheck className="size-5 text-success" />
            </div>
            <p className="text-[17px] font-semibold leading-tight">Confirmar recebimento</p>
            <p className="text-[13px] text-muted-foreground max-w-[280px]">
              Digite o código de 6 dígitos que o motorista entregou junto com a remessa.
            </p>
          </div>
          <DeliveryCodeInput onSubmit={handleConfirmCode} />
        </div>
      )}

      {/* Devolução — passo 1: a facção declara (peças + data) e gera o código */}
      {shipment.status === "RECEIVED_BY_FACTION" && (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
          {!declareForm ? (
            <button
              onClick={() => { setDeclareForm(true); setDeclOk(String(shipment.quantity_sent)); setDeclDefect("0"); }}
              className="w-full h-[48px] rounded-xl bg-foreground text-background text-[16px] font-semibold flex items-center justify-center gap-2 active:opacity-80"
            >
              <Undo2 className="size-5" /> Devolver remessa
            </button>
          ) : (
            <div className="space-y-4">
              <p className="text-[16px] font-semibold text-center">Declarar devolução</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-[12px] text-muted-foreground">Peças boas</span>
                  <input type="number" inputMode="numeric" min={0} value={declOk}
                    onChange={(e) => setDeclOk(e.target.value.replace(/\D/g, ""))}
                    className="w-full rounded-lg border border-border bg-card px-3 py-3 text-[18px] text-center" />
                </label>
                <label className="space-y-1">
                  <span className="text-[12px] text-muted-foreground">Com defeito</span>
                  <input type="number" inputMode="numeric" min={0} value={declDefect}
                    onChange={(e) => setDeclDefect(e.target.value.replace(/\D/g, ""))}
                    className="w-full rounded-lg border border-border bg-card px-3 py-3 text-[18px] text-center" />
                </label>
              </div>
              <label className="block space-y-1">
                <span className="text-[12px] text-muted-foreground">Data estimada de devolução</span>
                <input type="date" value={declDate} onChange={(e) => setDeclDate(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-3 text-[16px]" />
              </label>
              <p className="text-[12px] text-muted-foreground text-center">
                Enviado: {shipment.quantity_sent} peças. A soma não pode passar disso.
              </p>
              {declError && <p role="alert" className="text-[14px] text-destructive text-center">{declError}</p>}
              <div className="flex gap-2">
                <button onClick={() => setDeclareForm(false)}
                  className="flex-1 h-[48px] rounded-xl border border-border text-[16px] font-medium active:opacity-80">
                  Cancelar
                </button>
                <button onClick={handleDeclareReturn} disabled={declaring}
                  className="flex-1 h-[48px] rounded-xl bg-foreground text-background text-[16px] font-semibold active:opacity-80 disabled:opacity-50">
                  {declaring ? "Gerando..." : "Gerar código"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Devolução declarada — mostra o código para repassar ao motorista */}
      {shipment.status === "RETURN_DECLARED" && (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-3">
          <div className="text-center space-y-1">
            <p className="text-[16px] font-semibold">Devolução declarada</p>
            <p className="text-[13px] text-muted-foreground max-w-[300px] mx-auto">
              Passe este código ao motorista. A fábrica vai usá-lo para conferir as peças na chegada.
            </p>
          </div>
          <DeliveryCodeDisplay code={shipment.return_code ?? null} expiresAt={shipment.return_code_expires_at ?? null} />
          <p className="text-[12px] text-muted-foreground text-center">
            Declarado: {shipment.declared_ok ?? 0} boas · {shipment.declared_defect ?? 0} com defeito · aguardando conferência da fábrica.
          </p>
        </div>
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
          {shipment.defect_records.map((d) => {
            const answered = !!d.faction_response;
            return (
            <div key={d.id} className="rounded-xl border border-border bg-card p-4 text-[14px] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  {d.defect_type} · <span className={SEVERITY_TEXT[d.severity] || "text-muted-foreground"}>{SEVERITY_LABEL[d.severity] || d.severity}</span>
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  d.faction_response === "CONFIRMED" ? "bg-success/20 text-success"
                    : d.faction_response === "CONTESTED" ? "bg-destructive/20 text-destructive"
                    : "bg-warning/20 text-warning"
                }`}>
                  {d.faction_response === "CONFIRMED" ? "Confirmado" : d.faction_response === "CONTESTED" ? "Contestado" : "Aguardando"}
                </span>
              </div>
              {d.description && <p className="text-[13px] text-muted-foreground">{d.description}</p>}
              {!answered && (
                <button onClick={() => router.push("/portal/defects")}
                  className="text-[13px] font-medium text-foreground underline underline-offset-2 active:opacity-70">
                  Confirmar ou contestar →
                </button>
              )}
            </div>
            );
          })}
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

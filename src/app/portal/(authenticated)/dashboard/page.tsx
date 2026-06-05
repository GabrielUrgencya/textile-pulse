"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface SummaryData {
  factionName?: string;
  totalPiecesWithFaction: number;
  pendingReturns: number;
  pendingDefects: number;
  currentPeriodValue: number;
  nextDeadline: string | null;
  overdueCount: number;
  unreadNotifications: number;
  pendingConfirmation?: boolean;
  pendingShipmentId?: string;
}

function vibrate() {
  try { navigator?.vibrate?.(50); } catch { /* silent fallback */ }
}

export default function PortalDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/faction/summary")
      .then((r) => {
        if (!r.ok) throw new Error("Unauthorized");
        return r.json();
      })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton />;
  if (!data) return <p className="text-center text-[16px] text-muted-foreground py-12">Erro ao carregar dados.</p>;

  const paymentDate = data.nextDeadline
    ? new Date(data.nextDeadline).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
    : null;

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <h2 className="font-display text-[20px] font-semibold">
        Olá{data.factionName ? `, ${data.factionName}` : ""}
      </h2>

      {/* Main KPI: Pieces */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="text-[14px] text-muted-foreground">Peças com você</p>
        <p className="mt-1 font-display text-[36px] font-bold tracking-tight tabular-nums">
          {data.totalPiecesWithFaction.toLocaleString("pt-BR")}
        </p>
      </div>

      {/* Payment KPI */}
      <div className="rounded-2xl border border-success/30 bg-success/5 p-5">
        <p className="text-[14px] text-muted-foreground">Você vai receber</p>
        <p className="mt-1 font-display text-[32px] font-bold tracking-tight tabular-nums text-success">
          R$ {(data.currentPeriodValue || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
        </p>
        {paymentDate && (
          <p className="mt-1 text-[14px] text-muted-foreground">dia {paymentDate}</p>
        )}
      </div>

      {/* Mini cards row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[14px] text-muted-foreground">Devoluções</p>
          <p className="mt-1 font-display text-[24px] font-bold tabular-nums">{data.pendingReturns}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[14px] text-muted-foreground">Próximo prazo</p>
          <p className="mt-1 font-display text-[24px] font-bold tabular-nums">
            {data.nextDeadline ? new Date(data.nextDeadline).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—"}
          </p>
        </div>
      </div>

      {/* Overdue alert */}
      {data.overdueCount > 0 && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-5">
          <p className="text-[16px] font-semibold text-destructive">
            {data.overdueCount} lote{data.overdueCount > 1 ? "s" : ""} em atraso
          </p>
          <p className="mt-1 text-[14px] text-destructive/70">
            Entre em contato com a Liserie.
          </p>
        </div>
      )}

      {/* CTA: Pending confirmation */}
      {data.pendingConfirmation && data.pendingShipmentId && (
        <div className="rounded-2xl border border-success/30 bg-success/10 p-5 space-y-3">
          <p className="text-[16px] font-semibold text-success">Nova remessa recebida!</p>
          <button
            onClick={() => {
              vibrate();
              router.push(`/portal/shipments/${data.pendingShipmentId}`);
            }}
            className="w-full h-[48px] rounded-xl bg-success text-success-foreground text-[16px] font-semibold transition-opacity active:opacity-80"
          >
            Confirmar Recebimento →
          </button>
        </div>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-5">
      <div className="h-7 w-40 animate-pulse rounded bg-muted" />
      <div className="h-28 animate-pulse rounded-2xl bg-muted" />
      <div className="h-28 animate-pulse rounded-2xl bg-muted" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-20 animate-pulse rounded-xl bg-muted" />
        <div className="h-20 animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

interface SummaryData {
  totalPiecesWithFaction: number;
  pendingReturns: number;
  pendingDefects: number;
  currentPeriodValue: number;
  nextDeadline: string | null;
  overdueCount: number;
  unreadNotifications: number;
}

export default function PortalSummaryPage() {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/faction/summary")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton />;
  if (!data) return <p className="text-center text-muted-foreground">Erro ao carregar dados.</p>;

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-semibold">Resumo</h2>

      <div className="grid grid-cols-2 gap-3">
        <KpiCard
          label="Peças com você"
          value={data.totalPiecesWithFaction}
          format="number"
        />
        <KpiCard
          label="Valor do período"
          value={data.currentPeriodValue}
          format="currency"
        />
        <KpiCard
          label="Devoluções pendentes"
          value={data.pendingReturns}
          format="number"
          alert={data.pendingReturns > 0}
        />
        <KpiCard
          label="Defeitos pendentes"
          value={data.pendingDefects}
          format="number"
          alert={data.pendingDefects > 0}
        />
      </div>

      {data.overdueCount > 0 && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-sm font-semibold text-red-400">
            {data.overdueCount} lote{data.overdueCount > 1 ? "s" : ""} em atraso
          </p>
          <p className="mt-1 text-xs text-red-400/70">
            Entre em contato com a Liserie para resolver.
          </p>
        </div>
      )}

      {data.nextDeadline && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Próximo prazo</p>
          <p className="mt-1 text-lg font-semibold">
            {new Date(data.nextDeadline).toLocaleDateString("pt-BR")}
          </p>
        </div>
      )}

      {data.unreadNotifications > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-sm text-amber-400">
            {data.unreadNotifications} notificação{data.unreadNotifications > 1 ? "ões" : ""} não lida{data.unreadNotifications > 1 ? "s" : ""}
          </p>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  format,
  alert,
}: {
  label: string;
  value: number;
  format: "number" | "currency";
  alert?: boolean;
}) {
  const formatted =
    format === "currency"
      ? `R$ ${Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
      : Number(value || 0).toLocaleString("pt-BR");

  return (
    <div
      className={`rounded-lg border p-4 ${
        alert
          ? "border-amber-500/30 bg-amber-500/5"
          : "border-border bg-card"
      }`}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-bold tracking-tight">{formatted}</p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-6 w-24 animate-pulse rounded bg-muted" />
      <div className="grid grid-cols-2 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    </div>
  );
}

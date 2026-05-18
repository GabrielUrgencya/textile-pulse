"use client";

import { useEffect, useState } from "react";

interface FinancialData {
  currentPeriod: {
    period: string;
    totalValue: number;
    totalDeductions: number;
    netValue: number;
    shipmentCount: number;
  } | null;
  history: {
    period: string;
    totalValue: number;
    totalDeductions: number;
    netValue: number;
  }[];
}

export default function PortalFinancialPage() {
  const [data, setData] = useState<FinancialData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/faction/financial")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton />;
  if (!data) return <p className="text-center text-muted-foreground">Erro ao carregar dados.</p>;

  return (
    <div className="space-y-6">
      <h2 className="font-display text-lg font-semibold">Financeiro</h2>

      {/* Current period */}
      {data.currentPeriod ? (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <p className="text-xs text-muted-foreground">Período atual — {data.currentPeriod.period}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Valor bruto</p>
              <p className="text-2xl font-bold">{formatCurrency(data.currentPeriod.totalValue)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Deduções</p>
              <p className="text-2xl font-bold text-red-400">
                -{formatCurrency(data.currentPeriod.totalDeductions)}
              </p>
            </div>
          </div>
          <div className="border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">Valor líquido</p>
            <p className="text-3xl font-bold text-emerald-400">
              {formatCurrency(data.currentPeriod.netValue)}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {data.currentPeriod.shipmentCount} lote{data.currentPeriod.shipmentCount !== 1 ? "s" : ""} neste período
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhum período aberto.</p>
      )}

      {/* History */}
      {data.history && data.history.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Histórico</h3>
          {data.history.map((h) => (
            <div
              key={h.period}
              className="flex items-center justify-between rounded-lg border border-border bg-card p-3"
            >
              <div>
                <p className="text-sm font-medium">{h.period}</p>
                <p className="text-xs text-muted-foreground">
                  Bruto: {formatCurrency(h.totalValue)} · Ded: -{formatCurrency(h.totalDeductions)}
                </p>
              </div>
              <p className="text-sm font-semibold text-emerald-400">
                {formatCurrency(h.netValue)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatCurrency(value: number) {
  return `R$ ${Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-6 w-28 animate-pulse rounded bg-muted" />
      <div className="h-48 animate-pulse rounded-lg bg-muted" />
      <div className="h-6 w-20 animate-pulse rounded bg-muted" />
      {[...Array(2)].map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  );
}

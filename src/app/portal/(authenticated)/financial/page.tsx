"use client";

import { useCallback, useEffect, useState } from "react";
import { paymentSummaryLabel } from "@/lib/payment-display";
import { PullToRefresh } from "@/components/portal/PullToRefresh";

interface PeriodData {
  period: string;
  totalPayment: number;
  totalDeduction: number;
  totalReleased: number;
  totalRetained: number;
  totalPaid: number;
  netAmount: number;
  shipmentCount: number;
  piecesProcessed: number;
  isOpen: boolean;
}

interface FinancialData {
  openPeriod: PeriodData | null;
  history: PeriodData[];
  currentBalance?: number;
}

// Tons do herói (tema escuro do portal).
const HERO_TONE: Record<string, string> = {
  success: "text-emerald-400",
  warning: "text-amber-400",
  neutral: "text-muted-foreground",
  destructive: "text-red-400",
};

export default function PortalFinancialPage() {
  const [data, setData] = useState<FinancialData | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(
    () =>
      fetch("/api/faction/financial")
        .then((r) => {
          if (!r.ok) throw new Error("Fetch failed");
          return r.json();
        })
        .then((json) => setData(json))
        .catch(() => {}),
    [],
  );

  useEffect(() => {
    let alive = true;
    const load = (initial: boolean) =>
      fetch("/api/faction/financial")
        .then((r) => {
          if (!r.ok) throw new Error("Fetch failed");
          return r.json();
        })
        .then((json) => { if (alive) setData(json); })
        .catch(() => { if (alive && initial) setData(null); })
        .finally(() => { if (alive && initial) setLoading(false); });

    load(true);
    // Polling silencioso: reflete conferências/pagamentos em <3s sem refresh.
    const t = setInterval(() => load(false), 3000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (loading) return <LoadingSkeleton />;
  if (!data) return <p className="text-center text-muted-foreground">Erro ao carregar dados.</p>;

  const period = data.openPeriod;
  const now = new Date();
  const currentPeriodLabel = period?.period || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const summary = paymentSummaryLabel(data.currentBalance ?? 0);

  return (
    <PullToRefresh onRefresh={refresh}>
    <div className="space-y-5">
      <h2 className="font-display text-[20px] font-semibold">Pagamentos</h2>

      {/* Saldo — herói semântico (nunca expõe valor negativo com "−") */}
      <div className="rounded-2xl border border-success/30 bg-success/5 p-5 space-y-3">
        <p className="text-[13px] text-muted-foreground">Período atual — {currentPeriodLabel}</p>
        <div>
          <p className={`mt-1 font-display text-[26px] font-bold tracking-tight leading-tight ${HERO_TONE[summary.tone]}`}>
            {summary.label}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 border-t border-border/50 pt-3">
          <div>
            <p className="text-[12px] text-muted-foreground">Retido (defeitos em análise)</p>
            <p className="font-display text-[20px] font-bold tabular-nums text-amber-400">
              {formatCurrency(period?.totalRetained || 0)}
            </p>
          </div>
          <div>
            <p className="text-[12px] text-muted-foreground">Já pago</p>
            <p className="font-display text-[20px] font-bold tabular-nums">
              {formatCurrency(period?.totalPaid || 0)}
            </p>
          </div>
        </div>
        {(period?.totalRetained || 0) > 0 && (
          <p className="text-[12px] text-amber-400/90">
            O valor retido é liberado assim que os defeitos forem resolvidos.
          </p>
        )}
        <p className="text-[12px] text-muted-foreground">
          {period?.shipmentCount || 0} lote{(period?.shipmentCount || 0) !== 1 ? "s" : ""} neste período
        </p>
      </div>

      {/* No activity hint */}
      {!period && (!data.history || data.history.length === 0) && (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <svg className="h-6 w-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
            </svg>
          </div>
          <p className="text-[15px] font-medium">Sem movimentação ainda</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Seus pagamentos aparecerão aqui conforme os lotes forem processados.
          </p>
        </div>
      )}

      {/* History */}
      {data.history && data.history.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-[14px] font-semibold">Histórico</h3>
          {data.history.map((h) => (
            <div
              key={h.period}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-4"
            >
              <div>
                <p className="text-[14px] font-medium">{h.period}</p>
                <p className="text-[12px] text-muted-foreground">
                  Recebido: {formatCurrency(h.totalPaid)} · Retido: {formatCurrency(h.totalRetained)}
                </p>
              </div>
              <p className="text-[14px] font-semibold text-emerald-400">
                {formatCurrency(h.totalReleased)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
    </PullToRefresh>
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

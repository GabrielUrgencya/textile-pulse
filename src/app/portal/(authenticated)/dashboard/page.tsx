"use client";

import { useEffect, useState } from "react";
import { TENANT_TZ } from "@/lib/tz";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { paymentSummaryLabel } from "@/lib/payment-display";

interface SummaryData {
  factionName?: string;
  totalPiecesWithFaction: number;
  pendingReturns: number;
  pendingDefects: number;
  /** Fonte única: factions.current_balance (ledger). */
  currentBalance: number;
  nextDeadline: string | null;
  overdueCount: number;
  /** F4c — novos cards */
  returnedShipments?: number;
  totalPiecesReturned?: number;
  approvalRate?: number | null;
  unreadNotifications: number;
  pendingConfirmation?: boolean;
  pendingShipmentId?: string;
}

const HERO_TONE: Record<string, string> = {
  success: "text-success",
  warning: "text-warning",
  neutral: "text-muted-foreground",
  destructive: "text-destructive",
};

function vibrate() {
  try { navigator?.vibrate?.(50); } catch { /* silent fallback */ }
}

export default function PortalDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = (initial: boolean) =>
      fetch("/api/faction/summary")
        .then((r) => {
          if (!r.ok) throw new Error("Unauthorized");
          return r.json();
        })
        .then((json) => { if (alive) setData(json); })
        .catch(() => { if (alive && initial) setData(null); })
        .finally(() => { if (alive && initial) setLoading(false); });

    load(true);
    // Polling 2s: edições/lançamentos refletem no Início em <2s (AC da frente).
    const t = setInterval(() => load(false), 2000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (loading) return <LoadingSkeleton />;
  if (!data) return <p className="text-center text-[16px] text-muted-foreground py-12">Erro ao carregar dados.</p>;

  const paymentDate = data.nextDeadline
    ? new Date(data.nextDeadline).toLocaleDateString("pt-BR", { timeZone: TENANT_TZ, day: "2-digit", month: "2-digit" })
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

      {/* Payment KPI — fonte única (ledger) + display semântico compartilhado */}
      {(() => {
        const summary = paymentSummaryLabel(data.currentBalance ?? 0);
        return (
          <div className="rounded-2xl border border-success/30 bg-success/5 p-5">
            <p className={`font-display text-[26px] font-bold tracking-tight leading-tight ${HERO_TONE[summary.tone]}`}>
              {summary.label}
            </p>
            {paymentDate && (
              <p className="mt-1 text-[14px] text-muted-foreground">dia {paymentDate}</p>
            )}
          </div>
        );
      })()}

      {/* Mini cards row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[14px] text-muted-foreground">Devoluções</p>
          <p className="mt-1 font-display text-[24px] font-bold tabular-nums">{data.pendingReturns}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[14px] text-muted-foreground">Próximo prazo</p>
          <p className="mt-1 font-display text-[24px] font-bold tabular-nums">
            {data.nextDeadline ? new Date(data.nextDeadline).toLocaleDateString("pt-BR", { timeZone: TENANT_TZ, day: "2-digit", month: "2-digit" }) : "—"}
          </p>
        </div>
        {/* F4c — Remessas devolvidas + taxa de aprovação */}
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[14px] text-muted-foreground">Remessas devolvidas</p>
          <p className="mt-1 font-display text-[24px] font-bold tabular-nums">
            {(data.returnedShipments ?? 0).toLocaleString("pt-BR")}
          </p>
          <p className="text-[12px] text-muted-foreground">
            {(data.totalPiecesReturned ?? 0).toLocaleString("pt-BR")} peças devolvidas
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[14px] text-muted-foreground">Taxa de aprovação</p>
          <p
            className={`mt-1 font-display text-[24px] font-bold tabular-nums ${
              data.approvalRate == null
                ? "text-muted-foreground"
                : data.approvalRate >= 95
                  ? "text-success"
                  : data.approvalRate >= 85
                    ? "text-warning"
                    : "text-destructive"
            }`}
          >
            {data.approvalRate == null ? "—" : `${data.approvalRate}%`}
          </p>
        </div>
      </div>

      {/* Defeitos — acesso principal (F4: saiu do bottom-nav) */}
      <Link
        href="/portal/defects"
        className={`flex min-h-[56px] items-center justify-between rounded-2xl border p-4 transition-colors active:opacity-80 ${
          data.pendingDefects > 0
            ? "border-amber-500/30 bg-amber-500/5"
            : "border-border bg-card"
        }`}
      >
        <div>
          <p className="text-[16px] font-semibold">Defeitos</p>
          <p className="text-[13px] text-muted-foreground">
            {data.pendingDefects > 0
              ? `${data.pendingDefects} pendente${data.pendingDefects > 1 ? "s" : ""} de resposta`
              : "Nenhum defeito pendente"}
          </p>
        </div>
        <span className={`text-[20px] ${data.pendingDefects > 0 ? "text-amber-400" : "text-muted-foreground/50"}`}>→</span>
      </Link>

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

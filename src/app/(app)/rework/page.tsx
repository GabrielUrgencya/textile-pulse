"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Filter,
  BarChart3,
  List,
} from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { LisionCard, LisionCardHeader } from "@/components/ui/lision-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { MetricBox } from "@/components/ui/metric-box";

/* ────────────── Types ────────────── */

interface DefectRecord {
  id: string;
  lot_id: string;
  defect_type: string;
  severity: string;
  quantity: number;
  description: string | null;
  detected_at: string;
  resolved_at: string | null;
  status: string;
  previous_stage_id: string | null;
  detected_by: string;
  resolved_by: string | null;
  lots: {
    id: string;
    barcode: string;
    lot_number: string;
    production_orders: {
      id: string;
      op_number: string;
      product_name: string;
    };
  };
}

interface ReportData {
  by_type: Record<string, { count: number; quantity: number }>;
  by_op: Record<string, { count: number; quantity: number }>;
}

const DEFECT_TYPE_LABELS: Record<string, string> = {
  COSTURA: "Costura",
  TECIDO: "Tecido",
  AVIAMENTO: "Aviamento",
  OUTRO: "Outro",
};

const SEVERITY_LABELS: Record<string, string> = {
  LEVE: "Leve",
  MEDIO: "Médio",
  GRAVE: "Grave",
};

type Tab = "list" | "report";

/* ────────────── Page ────────────── */

export default function ReworkPage() {
  const [defects, setDefects] = useState<DefectRecord[]>([]);
  const [report, setReport] = useState<ReportData>({ by_type: {}, by_op: {} });
  const [pendingCount, setPendingCount] = useState(0);
  const [resolvedCount, setResolvedCount] = useState(0);
  const [totalDefectsCount, setTotalDefectsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("list");

  // Filters
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [typeFilter, setTypeFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const fetchDefects = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (typeFilter) params.set("defect_type", typeFilter);
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);

    try {
      const res = await fetch(`/api/defects?${params}`, { credentials: "same-origin" });
      if (!res.ok) {
        setError("Erro ao carregar defeitos. Tente novamente.");
        return;
      }
      const data = await res.json();
      setDefects(data.defects ?? []);
      setPendingCount(data.pending_count ?? 0);
      setResolvedCount(data.resolved_count ?? 0);
      setTotalDefectsCount(data.total_defects ?? 0);
      setReport(data.report ?? { by_type: {}, by_op: {} });
    } catch {
      setError("Erro de conexão com o servidor.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, fromDate, toDate]);

  useEffect(() => {
    fetchDefects();
  }, [fetchDefects]);

  async function handleResolve(defectId: string) {
    setResolving(defectId);
    setError(null);
    try {
      const res = await fetch(`/api/defects/${defectId}/resolve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        fetchDefects();
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Erro ao concluir retrabalho.");
      }
    } catch {
      setError("Erro de conexão ao concluir retrabalho.");
    } finally {
      setResolving(null);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Qualidade" title="Gestão de Retrabalho">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTab("list")}
            className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors flex items-center gap-1.5 ${
              tab === "list"
                ? "bg-foreground text-background"
                : "hover:bg-secondary/50 text-muted-foreground"
            }`}
          >
            <List className="size-3.5" />
            Lista
          </button>
          <button
            onClick={() => setTab("report")}
            className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors flex items-center gap-1.5 ${
              tab === "report"
                ? "bg-foreground text-background"
                : "hover:bg-secondary/50 text-muted-foreground"
            }`}
          >
            <BarChart3 className="size-3.5" />
            Relatório
          </button>
        </div>
      </PageHeader>

      {/* Error banner */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 text-[13px] text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-2.5"
        >
          <AlertTriangle className="size-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-destructive/60 hover:text-destructive text-[11px] font-medium"
          >
            Fechar
          </button>
        </motion.div>
      )}

      {/* KPI Row */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
      >
        <MetricBox label="Total Defeitos" value={String(totalDefectsCount)} />
        <MetricBox label="Pendentes" value={String(pendingCount)} accent />
        <MetricBox label="Resolvidos" value={String(resolvedCount)} />
        <MetricBox
          label="Qtd. Defeituosa"
          value={String(defects.reduce((sum, d) => sum + d.quantity, 0))}
        />
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
      >
        <LisionCard>
          <div className="flex items-center gap-2 mb-3">
            <Filter className="size-3.5 text-muted-foreground" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Filtros
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-lg bg-secondary/30 border border-border/40 text-foreground text-[13px] focus:outline-none focus:ring-1 focus:ring-foreground/20"
            >
              <option value="">Todos os status</option>
              <option value="PENDING">Pendentes</option>
              <option value="RESOLVED">Resolvidos</option>
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2 rounded-lg bg-secondary/30 border border-border/40 text-foreground text-[13px] focus:outline-none focus:ring-1 focus:ring-foreground/20"
            >
              <option value="">Todos os tipos</option>
              <option value="COSTURA">Costura</option>
              <option value="TECIDO">Tecido</option>
              <option value="AVIAMENTO">Aviamento</option>
              <option value="OUTRO">Outro</option>
            </select>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block font-medium">
                De
              </label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-secondary/30 border border-border/40 text-foreground text-[13px] focus:outline-none focus:ring-1 focus:ring-foreground/20"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block font-medium">
                Até
              </label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-secondary/30 border border-border/40 text-foreground text-[13px] focus:outline-none focus:ring-1 focus:ring-foreground/20"
              />
            </div>
          </div>
        </LisionCard>
      </motion.div>

      {/* Content */}
      {tab === "list" ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        >
          <LisionCard>
            <LisionCardHeader
              eyebrow="Defeitos"
              title="Lotes em Retrabalho"
              right={
                <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
                  {defects.length} registro{defects.length !== 1 ? "s" : ""}
                </span>
              }
            />

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : defects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle2 className="size-10 text-success/40 mb-3" strokeWidth={1.5} />
                <p className="text-[13px] text-muted-foreground">
                  Nenhum defeito encontrado
                </p>
              </div>
            ) : (
              <>
                {/* Header row */}
                <div className="hidden md:grid grid-cols-12 gap-2 px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  <div className="col-span-2">Lote</div>
                  <div className="col-span-2">OP</div>
                  <div className="col-span-2">Tipo</div>
                  <div className="col-span-1">Sev.</div>
                  <div className="col-span-1">Qtd</div>
                  <div className="col-span-2">Data</div>
                  <div className="col-span-2 text-right">Ação</div>
                </div>

                <div className="space-y-1">
                  {defects.map((defect, i) => (
                    <motion.div
                      key={defect.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: 0.03 * i, ease: [0.22, 1, 0.36, 1] }}
                      className="grid grid-cols-2 md:grid-cols-12 gap-2 items-center px-2 py-2.5 rounded-lg hover:bg-secondary/30 transition-colors"
                    >
                      <div className="col-span-2 font-mono text-[12px] tabular-nums truncate">
                        {defect.lots.barcode}
                      </div>
                      <div className="col-span-2 text-[12px] text-muted-foreground truncate">
                        {defect.lots.production_orders.op_number}
                      </div>
                      <div className="col-span-2">
                        <StatusBadge status="warning">
                          {DEFECT_TYPE_LABELS[defect.defect_type] ?? defect.defect_type}
                        </StatusBadge>
                      </div>
                      <div className="col-span-1">
                        <StatusBadge
                          status={
                            defect.severity === "GRAVE"
                              ? "destructive"
                              : defect.severity === "MEDIO"
                                ? "warning"
                                : "success"
                          }
                        >
                          {SEVERITY_LABELS[defect.severity] ?? defect.severity}
                        </StatusBadge>
                      </div>
                      <div className="col-span-1 font-mono text-[12px] tabular-nums">
                        {defect.quantity}
                      </div>
                      <div className="col-span-2 font-mono text-[11px] tabular-nums text-muted-foreground">
                        {new Date(defect.detected_at).toLocaleDateString("pt-BR")}
                      </div>
                      <div className="col-span-2 text-right">
                        {defect.status === "PENDING" ? (
                          <button
                            onClick={() => handleResolve(defect.id)}
                            disabled={resolving === defect.id}
                            className="px-3 py-1.5 rounded-lg bg-foreground text-background text-[12px] font-medium hover:bg-foreground/90 disabled:opacity-40 transition-colors inline-flex items-center gap-1.5"
                          >
                            {resolving === defect.id ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              <CheckCircle2 className="size-3" />
                            )}
                            Concluir
                          </button>
                        ) : (
                          <StatusBadge status="success">Resolvido</StatusBadge>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </>
            )}
          </LisionCard>
        </motion.div>
      ) : (
        /* Report Tab */
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-4"
        >
          {/* By Type */}
          <LisionCard>
            <LisionCardHeader eyebrow="Agrupamento" title="Defeitos por Tipo" />
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : Object.keys(report.by_type).length === 0 ? (
              <p className="text-[13px] text-muted-foreground text-center py-8">
                Sem dados no período
              </p>
            ) : (
              <div className="space-y-1">
                <div className="grid grid-cols-3 gap-2 px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <div>Tipo</div>
                  <div className="text-right">Ocorrências</div>
                  <div className="text-right">Qtd. Total</div>
                </div>
                {Object.entries(report.by_type).map(([type, data]) => (
                  <div
                    key={type}
                    className="grid grid-cols-3 gap-2 items-center px-2 py-2 rounded-lg hover:bg-secondary/30 transition-colors"
                  >
                    <div className="text-[13px] font-medium">
                      {DEFECT_TYPE_LABELS[type] ?? type}
                    </div>
                    <div className="text-right font-mono text-[13px] tabular-nums">
                      {data.count}
                    </div>
                    <div className="text-right font-mono text-[13px] tabular-nums text-muted-foreground">
                      {data.quantity}
                    </div>
                  </div>
                ))}
                {/* Total row */}
                <div className="grid grid-cols-3 gap-2 items-center px-2 py-2 border-t border-border/40 mt-1">
                  <div className="text-[13px] font-semibold">Total</div>
                  <div className="text-right font-mono text-[13px] tabular-nums font-semibold">
                    {Object.values(report.by_type).reduce((s, d) => s + d.count, 0)}
                  </div>
                  <div className="text-right font-mono text-[13px] tabular-nums font-semibold">
                    {Object.values(report.by_type).reduce((s, d) => s + d.quantity, 0)}
                  </div>
                </div>
              </div>
            )}
          </LisionCard>

          {/* By OP */}
          <LisionCard>
            <LisionCardHeader eyebrow="Agrupamento" title="Defeitos por OP" />
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : Object.keys(report.by_op).length === 0 ? (
              <p className="text-[13px] text-muted-foreground text-center py-8">
                Sem dados no período
              </p>
            ) : (
              <div className="space-y-1">
                <div className="grid grid-cols-3 gap-2 px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <div>OP</div>
                  <div className="text-right">Ocorrências</div>
                  <div className="text-right">Qtd. Total</div>
                </div>
                {Object.entries(report.by_op).map(([op, data]) => (
                  <div
                    key={op}
                    className="grid grid-cols-3 gap-2 items-center px-2 py-2 rounded-lg hover:bg-secondary/30 transition-colors"
                  >
                    <div className="font-mono text-[13px] tabular-nums">{op}</div>
                    <div className="text-right font-mono text-[13px] tabular-nums">
                      {data.count}
                    </div>
                    <div className="text-right font-mono text-[13px] tabular-nums text-muted-foreground">
                      {data.quantity}
                    </div>
                  </div>
                ))}
                {/* Total row */}
                <div className="grid grid-cols-3 gap-2 items-center px-2 py-2 border-t border-border/40 mt-1">
                  <div className="text-[13px] font-semibold">Total</div>
                  <div className="text-right font-mono text-[13px] tabular-nums font-semibold">
                    {Object.values(report.by_op).reduce((s, d) => s + d.count, 0)}
                  </div>
                  <div className="text-right font-mono text-[13px] tabular-nums font-semibold">
                    {Object.values(report.by_op).reduce((s, d) => s + d.quantity, 0)}
                  </div>
                </div>
              </div>
            )}
          </LisionCard>
        </motion.div>
      )}
    </div>
  );
}

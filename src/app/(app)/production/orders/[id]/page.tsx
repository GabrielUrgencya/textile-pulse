"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion } from "motion/react";
import {
  ArrowLeft,
  Loader2,
  Package,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { LisionCard, LisionCardHeader } from "@/components/ui/lision-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { MetricBox } from "@/components/ui/metric-box";

/* ────────────── Types ────────────── */

interface Order {
  id: string;
  op_number: string;
  product_name: string;
  reference: string | null;
  description: string | null;
  total_quantity: number;
  status: string;
  priority: number;
  notes: string | null;
  created_at: string;
}

interface Lot {
  id: string;
  barcode: string;
  lot_number: string;
  quantity: number;
  status: string;
  current_stage_id: string | null;
  created_at: string;
}

interface ComputedQuantities {
  produced: number;
  stocked: number;
  defect: number;
  discarded: number;
}

/* ────────────── Helpers ────────────── */

const STATUS_MAP: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "neutral" }> = {
  OPEN: { label: "ABERTA", variant: "neutral" },
  IN_PROGRESS: { label: "EM PRODUÇÃO", variant: "warning" },
  COMPLETED: { label: "CONCLUÍDA", variant: "success" },
  CANCELLED: { label: "CANCELADA", variant: "destructive" },
};

const LOT_STATUS_MAP: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "neutral" }> = {
  CREATED: { label: "CRIADO", variant: "neutral" },
  IN_CUT: { label: "CORTE", variant: "warning" },
  IN_TRIMS: { label: "AVIAMENTOS", variant: "warning" },
  IN_PRODUCTION: { label: "PRODUÇÃO", variant: "warning" },
  AT_FACTION: { label: "FACÇÃO", variant: "warning" },
  IN_FINISHING: { label: "ACABAMENTO", variant: "warning" },
  IN_CLEANING: { label: "LIMPEZA", variant: "warning" },
  IN_QUALITY: { label: "QUALIDADE", variant: "warning" },
  IN_PACKING: { label: "EMBALAGEM", variant: "warning" },
  IN_STOCK: { label: "ESTOQUE", variant: "success" },
  PARTIALLY_STOCKED: { label: "PARCIAL", variant: "success" },
};

function getStatus(map: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "neutral" }>, status: string) {
  return map[status] ?? { label: status, variant: "neutral" as const };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ────────────── Page ────────────── */

export default function OrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [lots, setLots] = useState<Lot[]>([]);
  const [computed, setComputed] = useState<ComputedQuantities>({ produced: 0, stocked: 0, defect: 0, discarded: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchOrder = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/production/orders/${id}`);
      if (!res.ok) {
        setError("Ordem não encontrada");
        return;
      }
      const data = await res.json();
      setOrder(data.order);
      setLots(data.lots ?? []);
      setComputed(data.computed_quantities ?? { produced: 0, stocked: 0, defect: 0, discarded: 0 });
    } catch {
      setError("Erro ao carregar ordem");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] gap-2 text-[13px] text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Carregando...
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-muted-foreground">
        <AlertTriangle className="size-10 opacity-20 mb-3" />
        <div className="text-[13px]">{error || "Ordem não encontrada"}</div>
        <button
          onClick={() => router.back()}
          className="mt-4 h-9 px-4 rounded-lg bg-secondary/60 border border-border/60 text-[13px] hover:bg-secondary transition"
        >
          Voltar
        </button>
      </div>
    );
  }

  const st = getStatus(STATUS_MAP, order.status);
  const totalLots = lots.length;
  const completedLots = lots.filter((l) => l.status === "IN_STOCK" || l.status === "PARTIALLY_STOCKED").length;
  const progressPercent = totalLots > 0 ? Math.round((completedLots / totalLots) * 100) : 0;

  return (
    <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-6 lg:py-8">
      <PageHeader eyebrow="Ordens de Produção" title={`OP-${order.op_number}`}>
        <div className="flex items-center gap-3">
          <StatusBadge status={st.variant} size="md">{st.label}</StatusBadge>
          <button
            onClick={() => router.push("/production/orders")}
            className="h-9 px-4 rounded-lg bg-secondary/60 border border-border/60 text-[13px] font-medium hover:bg-secondary transition flex items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Voltar
          </button>
        </div>
      </PageHeader>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <MetricBox label="Quantidade Total" value={order.total_quantity.toLocaleString("pt-BR")} accent />
        <MetricBox label="Produzidos" value={String(computed.produced)} />
        <MetricBox label="Defeitos" value={String(computed.defect)} />
        <MetricBox label="Em Estoque" value={String(computed.stocked)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Main: Progress + Lots */}
        <div className="lg:col-span-8 space-y-4">
          {/* Progress */}
          <LisionCard>
            <LisionCardHeader eyebrow="Progresso" title="Conclusão dos Lotes" />
            <div className="flex items-center gap-4 mb-3">
              <div className="flex-1">
                <div className="relative h-2.5 rounded-full bg-secondary overflow-hidden">
                  <motion.div
                    className="absolute inset-y-0 left-0 bg-foreground rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPercent}%` }}
                    transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
              </div>
              <div className="font-display text-[22px] font-semibold tabular-nums w-16 text-right">
                {progressPercent}%
              </div>
            </div>
            <div className="text-[11px] text-muted-foreground">
              {completedLots} de {totalLots} lotes concluídos
            </div>
          </LisionCard>

          {/* Lots Table */}
          <LisionCard pad={false}>
            <LisionCardHeader eyebrow="Sub-lotes" title={`${totalLots} Lotes`} className="px-5 pt-5" />

            <div className="grid grid-cols-12 px-5 py-2 text-[10px] uppercase tracking-wider text-muted-foreground border-y border-border/40 bg-secondary/20">
              <div className="col-span-1">#</div>
              <div className="col-span-3">Código de Barras</div>
              <div className="col-span-2 text-right">Quantidade</div>
              <div className="col-span-3 text-center">Status</div>
              <div className="col-span-3 text-right">Criado em</div>
            </div>

            {lots.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Package className="size-8 opacity-20 mb-2" strokeWidth={1.5} />
                <div className="text-[13px]">Nenhum lote gerado</div>
              </div>
            ) : (
              lots.map((lot, i) => {
                const ls = getStatus(LOT_STATUS_MAP, lot.status);
                return (
                  <motion.div
                    key={lot.id}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.03 * i }}
                    className="grid grid-cols-12 items-center px-5 py-3 text-[13px] border-b border-border/30 last:border-0 hover:bg-secondary/20 transition"
                  >
                    <div className="col-span-1">
                      <div className="size-7 rounded-md bg-foreground text-background grid place-items-center text-[10px] font-mono font-bold">
                        {lot.lot_number}
                      </div>
                    </div>
                    <div className="col-span-3 font-mono text-[11px] text-muted-foreground">
                      {lot.barcode}
                    </div>
                    <div className="col-span-2 text-right font-mono tabular-nums">
                      {lot.quantity.toLocaleString("pt-BR")}
                    </div>
                    <div className="col-span-3 flex justify-center">
                      <StatusBadge status={ls.variant}>{ls.label}</StatusBadge>
                    </div>
                    <div className="col-span-3 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
                      {formatDate(lot.created_at)}
                    </div>
                  </motion.div>
                );
              })
            )}
          </LisionCard>
        </div>

        {/* Sidebar: Order Info */}
        <div className="lg:col-span-4 space-y-4">
          <LisionCard>
            <LisionCardHeader eyebrow="Informações" title="Dados da OP" />
            <div className="space-y-3">
              <InfoRow label="Produto" value={order.product_name} />
              <InfoRow label="Referência" value={order.reference || "—"} mono />
              {order.description && <InfoRow label="Descrição" value={order.description} />}
              <InfoRow label="Prioridade" value={order.priority === 2 ? "Urgente" : order.priority === 1 ? "Alta" : "Normal"} />
              <InfoRow label="Criado em" value={formatDate(order.created_at)} mono />
              {order.notes && <InfoRow label="Notas" value={order.notes} />}
            </div>
          </LisionCard>

          {/* Quantities Summary */}
          <LisionCard>
            <LisionCardHeader eyebrow="Resumo" title="Quantidades" />
            <div className="space-y-2.5">
              <QtyRow icon={<Package className="size-3.5" />} label="Total" value={order.total_quantity} />
              <QtyRow icon={<CheckCircle2 className="size-3.5 text-success" />} label="Produzidos" value={computed.produced} />
              <QtyRow icon={<AlertTriangle className="size-3.5 text-warning" />} label="Defeitos" value={computed.defect} />
              <QtyRow icon={<XCircle className="size-3.5 text-destructive" />} label="Descartados" value={computed.discarded} />
            </div>
          </LisionCard>
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">{label}</div>
      <div className={`text-[13px] text-right ${mono ? "font-mono text-[11px]" : ""}`}>{value}</div>
    </div>
  );
}

function QtyRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2.5">
      {icon}
      <div className="flex-1 text-[12px] text-muted-foreground">{label}</div>
      <div className="font-mono text-[13px] tabular-nums font-medium">{value.toLocaleString("pt-BR")}</div>
    </div>
  );
}

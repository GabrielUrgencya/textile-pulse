"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  CheckSquare,
  Download,
  FileText,
  Loader2,
  Package,
  Printer,
  CheckCircle2,
  AlertTriangle,
  Square,
  X,
  XCircle,
  Scissors,
  Ban,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/ui/page-header";
import { LisionCard, LisionCardHeader } from "@/components/ui/lision-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { MetricBox } from "@/components/ui/metric-box";
import { hasPermission, type AppRole } from "@/lib/permissions";
import { SplitLotModal } from "@/components/production/SplitLotModal";
import { CancelOpModal } from "@/components/production/CancelOpModal";

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

/* ────────────── Download helper ────────────── */

async function downloadLabels(lotIds: string[], format: "zpl" | "pdf") {
  const url = format === "pdf" ? "/api/print/label?format=pdf" : "/api/print/label";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lot_ids: lotIds }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Erro desconhecido" }));
    throw new Error(data.error || `Erro ${res.status}`);
  }

  const rawBlob = await res.blob();
  const mimeType = format === "pdf" ? "application/pdf" : "text/plain";
  const blob = new Blob([rawBlob], { type: mimeType });
  const ext = format === "pdf" ? "pdf" : "txt";
  const filename = `etiquetas-${Date.now()}.${ext}`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
  return filename;
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
  const [userRole, setUserRole] = useState<AppRole | null>(null);

  // T1: Label selection state
  const [selectedLots, setSelectedLots] = useState<Set<string>>(new Set());
  const [showPreview, setShowPreview] = useState(false);
  const [downloading, setDownloading] = useState<"zpl" | "pdf" | null>(null);

  // Story 8.15 / 8.16
  const [splitLot, setSplitLot] = useState<Lot | null>(null);
  const [showCancel, setShowCancel] = useState(false);

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
      if (data.user_role) setUserRole(data.user_role as AppRole);
    } catch {
      setError("Erro ao carregar ordem");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  /* ── Selection handlers ── */

  const toggleLot = (lotId: string) => {
    setSelectedLots((prev) => {
      const next = new Set(prev);
      if (next.has(lotId)) next.delete(lotId);
      else next.add(lotId);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedLots.size === lots.length) {
      setSelectedLots(new Set());
    } else {
      setSelectedLots(new Set(lots.map((l) => l.id)));
    }
  };

  /* ── Download handlers ── */

  const handleDownload = async (format: "zpl" | "pdf") => {
    if (selectedLots.size === 0) return;
    setDownloading(format);
    try {
      const filename = await downloadLabels(Array.from(selectedLots), format);
      toast.success(`${selectedLots.size} etiqueta(s) baixada(s)`, {
        description: filename,
      });
    } catch (err) {
      toast.error("Erro ao gerar etiquetas", {
        description: err instanceof Error ? err.message : "Tente novamente",
      });
    } finally {
      setDownloading(null);
    }
  };

  /* ── Loading / Error states ── */

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
  const allSelected = selectedLots.size === lots.length && lots.length > 0;
  const selectedLotsData = lots.filter((l) => selectedLots.has(l.id));
  const canPrintLabels = userRole ? hasPermission(userRole, "labels:print") : false;
  const canCancel = userRole ? hasPermission(userRole, "orders:delete") : false;
  const canSplit = userRole ? hasPermission(userRole, "orders:create") : false;
  const SPLITTABLE = ["CREATED", "IN_CUT"];

  return (
    <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-6 lg:py-8">
      <PageHeader eyebrow="Ordens de Produção" title={`OP-${order.op_number}`}>
        <div className="flex items-center gap-3">
          <StatusBadge status={st.variant} size="md">{st.label}</StatusBadge>
          {canCancel && order.status !== "CANCELLED" && (
            <button
              onClick={() => setShowCancel(true)}
              className="h-9 px-4 rounded-lg bg-destructive/10 border border-destructive/30 text-[13px] font-medium hover:bg-destructive/20 transition flex items-center gap-2 text-destructive"
            >
              <Ban className="size-4" />
              Cancelar OP
            </button>
          )}
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

          {/* Lots Table with Selection */}
          <LisionCard pad={false}>
            <div className="flex items-center justify-between px-5 pt-5 pb-2">
              <LisionCardHeader eyebrow="Sub-lotes" title={`${totalLots} Lotes`} className="mb-0" />

              {/* Print actions — visible when lots selected and user has labels:print permission */}
              {canPrintLabels && selectedLots.size > 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center gap-2"
                >
                  <span className="text-[11px] text-muted-foreground mr-1">
                    {selectedLots.size} selecionado(s)
                  </span>
                  <button
                    onClick={() => setShowPreview(true)}
                    className="h-8 px-3 rounded-lg bg-secondary/60 border border-border/60 text-[12px] font-medium hover:bg-secondary transition flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                  >
                    <Printer className="size-3.5" />
                    Preview
                  </button>
                  <button
                    onClick={() => handleDownload("zpl")}
                    disabled={downloading !== null}
                    className="h-8 px-3 rounded-lg bg-foreground text-background text-[12px] font-medium hover:bg-foreground/90 transition flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {downloading === "zpl" ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                    ZPL
                  </button>
                  <button
                    onClick={() => handleDownload("pdf")}
                    disabled={downloading !== null}
                    className="h-8 px-3 rounded-lg bg-secondary/60 border border-border/60 text-[12px] font-medium hover:bg-secondary transition flex items-center gap-1.5 text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    {downloading === "pdf" ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />}
                    PDF
                  </button>
                </motion.div>
              )}
            </div>

            {/* Table header with select all */}
            <div className="grid grid-cols-12 px-5 py-2 text-[10px] uppercase tracking-wider text-muted-foreground border-y border-border/40 bg-secondary/20">
              <div className="col-span-1 flex items-center">
                {canPrintLabels && (
                  <button onClick={selectAll} className="hover:text-foreground transition" aria-label={allSelected ? "Limpar seleção" : "Selecionar todos"}>
                    {allSelected ? <CheckSquare className="size-4" /> : <Square className="size-4" />}
                  </button>
                )}
              </div>
              <div className="col-span-1">#</div>
              <div className="col-span-3">Código de Barras</div>
              <div className="col-span-2 text-right">Quantidade</div>
              <div className="col-span-2 text-center">Status</div>
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
                const isSelected = selectedLots.has(lot.id);
                return (
                  <motion.div
                    key={lot.id}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.03 * i, ease: [0.22, 1, 0.36, 1] }}
                    onClick={canPrintLabels ? () => toggleLot(lot.id) : undefined}
                    className={`grid grid-cols-12 items-center px-5 py-3 text-[13px] border-b border-border/30 last:border-0 hover:bg-secondary/20 transition ${canPrintLabels ? "cursor-pointer" : ""} ${isSelected ? "bg-secondary/30" : ""}`}
                  >
                    <div className="col-span-1 flex items-center">
                      {canPrintLabels && (
                        isSelected ? <CheckSquare className="size-4 text-foreground" /> : <Square className="size-4 text-muted-foreground" />
                      )}
                    </div>
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
                    <div className="col-span-2 flex justify-center">
                      <StatusBadge status={ls.variant}>{ls.label}</StatusBadge>
                    </div>
                    <div className="col-span-3 flex items-center justify-end gap-2 font-mono text-[11px] text-muted-foreground tabular-nums">
                      <span>{formatDate(lot.created_at)}</span>
                      {canSplit && SPLITTABLE.includes(lot.status) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSplitLot(lot);
                          }}
                          className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition"
                          title="Fracionar lote"
                        >
                          <Scissors className="size-3.5" />
                        </button>
                      )}
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

      {/* T2: Label Preview Dialog */}
      <AnimatePresence>
        {showPreview && (
          <LabelPreviewDialog
            lots={selectedLotsData}
            order={order}
            onClose={() => setShowPreview(false)}
            onDownloadZpl={() => { setShowPreview(false); handleDownload("zpl"); }}
            onDownloadPdf={() => { setShowPreview(false); handleDownload("pdf"); }}
            downloading={downloading}
          />
        )}
      </AnimatePresence>

      {/* Story 8.15: Split Lot Modal */}
      <AnimatePresence>
        {splitLot && (
          <SplitLotModal
            lotId={splitLot.id}
            lotNumber={splitLot.lot_number}
            lotQuantity={splitLot.quantity}
            onClose={() => setSplitLot(null)}
            onSplit={() => {
              setSplitLot(null);
              setSelectedLots(new Set());
              fetchOrder();
            }}
          />
        )}
      </AnimatePresence>

      {/* Story 8.16: Cancel OP Modal */}
      <AnimatePresence>
        {showCancel && (
          <CancelOpModal
            orderId={order.id}
            opNumber={order.op_number}
            onClose={() => setShowCancel(false)}
            onCancelled={() => {
              setShowCancel(false);
              router.push("/production/orders");
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ────────────── Label Preview Dialog ────────────── */

function LabelPreviewDialog({
  lots,
  order,
  onClose,
  onDownloadZpl,
  onDownloadPdf,
  downloading,
}: {
  lots: Lot[];
  order: Order;
  onClose: () => void;
  onDownloadZpl: () => void;
  onDownloadPdf: () => void;
  downloading: "zpl" | "pdf" | null;
}) {
  const previewLots = lots.slice(0, 5);
  const remaining = lots.length - previewLots.length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg"
      >
        <LisionCard>
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80 mb-1.5 font-medium">
                Preview de Etiquetas
              </div>
              <h3 className="text-[15px] font-semibold tracking-tight">
                {lots.length} etiqueta(s) selecionada(s)
              </h3>
            </div>
            <button
              onClick={onClose}
              className="size-8 rounded-lg bg-secondary/60 border border-border/60 grid place-items-center hover:bg-secondary transition"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Warning */}
          <div className="flex items-start gap-2 text-[11px] py-1.5 px-3 rounded-lg bg-secondary/30 border border-border/40 mb-4">
            <AlertTriangle className="size-3.5 mt-0.5 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">Representação aproximada — layout real na impressão ZPL/PDF</span>
          </div>

          {/* Label previews */}
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {previewLots.map((lot, i) => (
              <motion.div
                key={lot.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i, ease: [0.22, 1, 0.36, 1] }}
              >
                <LabelPreview
                  barcode={lot.barcode}
                  opNumber={order.op_number}
                  lotNumber={lot.lot_number}
                  productName={order.product_name}
                  reference={order.reference}
                />
              </motion.div>
            ))}

            {remaining > 0 && (
              <div className="text-center text-[12px] text-muted-foreground py-2">
                e mais {remaining} etiqueta(s)...
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 mt-5 pt-4 border-t border-border/40">
            <button
              onClick={onDownloadZpl}
              disabled={downloading !== null}
              className="flex-1 h-9 rounded-lg bg-foreground text-background text-[13px] font-medium hover:bg-foreground/90 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {downloading === "zpl" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              Baixar ZPL
            </button>
            <button
              onClick={onDownloadPdf}
              disabled={downloading !== null}
              className="flex-1 h-9 rounded-lg bg-secondary/60 border border-border/60 text-[13px] font-medium hover:bg-secondary transition flex items-center justify-center gap-2 text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {downloading === "pdf" ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
              Baixar PDF
            </button>
          </div>
        </LisionCard>
      </motion.div>
    </motion.div>
  );
}

/* ────────────── Label Preview Component ────────────── */

function LabelPreview({
  barcode,
  opNumber,
  lotNumber,
  productName,
  reference,
}: {
  barcode: string;
  opNumber: string;
  lotNumber: string;
  productName: string;
  reference: string | null;
}) {
  return (
    <div className="bg-white text-black rounded-lg border-2 border-border/60 p-3 relative overflow-hidden">
      {/* Simulated barcode lines */}
      <div className="flex items-end gap-[1px] h-8 mb-1">
        {barcode.split("").map((char, i) => {
          const w = ((char.charCodeAt(0) % 3) + 1);
          return (
            <div
              key={i}
              className="bg-black shrink-0"
              style={{ width: `${w}px`, height: "28px" }}
            />
          );
        })}
      </div>

      {/* Barcode text */}
      <div className="font-mono text-[10px] tracking-wider text-black/70 mb-2">
        {barcode}
      </div>

      {/* Info */}
      <div className="flex items-center gap-2 text-[10px]">
        <span className="font-mono font-bold">OP-{opNumber}</span>
        <span className="text-black/40">|</span>
        <span className="font-mono font-bold">{lotNumber}</span>
      </div>
      <div className="text-[10px] text-black/70 truncate">{productName}</div>
      {reference && (
        <div className="text-[9px] text-black/50 truncate">Ref: {reference}</div>
      )}
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

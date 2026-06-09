"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Factory,
  Download,
} from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { LisionCard, LisionCardHeader } from "@/components/ui/lision-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { MetricBox } from "@/components/ui/metric-box";
import { ExportModal } from "@/components/export/ExportModal";

/* ────────────── Types ────────────── */

interface ProductionOrder {
  id: string;
  op_number: string;
  product_name: string;
  reference: string | null;
  total_quantity: number;
  status: string;
  priority: number;
  notes: string | null;
  created_at: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

/* ────────────── Helpers ────────────── */

const STATUS_MAP: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "neutral" }> = {
  OPEN: { label: "ABERTA", variant: "neutral" },
  IN_PROGRESS: { label: "EM PRODUÇÃO", variant: "warning" },
  COMPLETED: { label: "CONCLUÍDA", variant: "success" },
  CANCELLED: { label: "CANCELADA", variant: "destructive" },
};

function getStatus(status: string) {
  return STATUS_MAP[status] ?? { label: status, variant: "neutral" as const };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

/* ────────────── Page ────────────── */

export default function ProductionOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [exportOpen, setExportOpen] = useState(false);

  const fetchOrders = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      const res = await fetch(`/api/production/orders?${params}`);
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders ?? []);
        setPagination(data.pagination ?? { page: 1, limit: 20, total: 0, pages: 0 });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  /* Client-side filters */
  const filtered = orders.filter((o) => {
    if (statusFilter && o.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        o.op_number.toLowerCase().includes(q) ||
        o.product_name.toLowerCase().includes(q) ||
        (o.reference?.toLowerCase().includes(q) ?? false)
      );
    }
    return true;
  });

  /* KPI counts */
  const totalOps = pagination.total;
  const openCount = orders.filter((o) => o.status === "OPEN").length;
  const inProgressCount = orders.filter((o) => o.status === "IN_PROGRESS").length;
  const completedCount = orders.filter((o) => o.status === "COMPLETED").length;

  return (
    <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-6 lg:py-8">
      <PageHeader eyebrow="Módulo de Produção" title="Ordens de Produção">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExportOpen(true)}
            className="h-9 px-4 rounded-lg border border-border text-[13px] font-medium hover:bg-secondary/60 transition flex items-center gap-2"
          >
            <Download className="size-4" />
            Exportar
          </button>
          <button
            onClick={() => router.push("/production/orders/new")}
            className="h-9 px-4 rounded-lg bg-foreground text-background text-[13px] font-semibold hover:bg-foreground/90 transition flex items-center gap-2"
          >
            <Plus className="size-4" />
            Nova OP
          </button>
        </div>
      </PageHeader>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <MetricBox label="Total OPs" value={String(totalOps)} accent />
        <MetricBox label="Abertas" value={String(openCount)} />
        <MetricBox label="Em Produção" value={String(inProgressCount)} />
        <MetricBox label="Concluídas" value={String(completedCount)} />
      </div>

      {/* Filters */}
      <LisionCard className="mb-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por código, produto ou referência..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 rounded-lg bg-secondary/40 border border-border/60 text-[13px] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring transition"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-3 rounded-lg bg-secondary/40 border border-border/60 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring transition appearance-none cursor-pointer"
          >
            <option value="">Todos os status</option>
            <option value="OPEN">Aberta</option>
            <option value="IN_PROGRESS">Em Produção</option>
            <option value="COMPLETED">Concluída</option>
            <option value="CANCELLED">Cancelada</option>
          </select>
        </div>
      </LisionCard>

      {/* Table */}
      <LisionCard pad={false}>
        <LisionCardHeader eyebrow="Listagem" title="Ordens de Produção" className="px-5 pt-5" />

        {/* Header */}
        <div className="grid grid-cols-12 px-5 py-2 text-[10px] uppercase tracking-wider text-muted-foreground border-y border-border/40 bg-secondary/20">
          <div className="col-span-2">Código</div>
          <div className="col-span-3">Produto</div>
          <div className="col-span-2">Referência</div>
          <div className="col-span-1 text-right">Qtd</div>
          <div className="col-span-2 text-center">Status</div>
          <div className="col-span-2 text-right">Data</div>
        </div>

        {/* Rows */}
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Carregando...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Factory className="size-10 opacity-20 mb-3" strokeWidth={1.5} />
            <div className="text-[13px]">Nenhuma ordem encontrada</div>
          </div>
        ) : (
          filtered.map((order, i) => {
            const st = getStatus(order.status);
            return (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.03 * i }}
                onClick={() => router.push(`/production/orders/${order.id}`)}
                className="grid grid-cols-12 items-center px-5 py-3.5 text-[13px] border-b border-border/30 last:border-0 hover:bg-secondary/20 transition cursor-pointer"
              >
                <div className="col-span-2 font-mono text-[12px] font-medium">
                  {order.op_number}
                </div>
                <div className="col-span-3 truncate">{order.product_name}</div>
                <div className="col-span-2 font-mono text-[11px] text-muted-foreground truncate">
                  {order.reference || "—"}
                </div>
                <div className="col-span-1 text-right font-mono tabular-nums">
                  {order.total_quantity.toLocaleString("pt-BR")}
                </div>
                <div className="col-span-2 flex justify-center">
                  <StatusBadge status={st.variant}>{st.label}</StatusBadge>
                </div>
                <div className="col-span-2 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
                  {formatDate(order.created_at)}
                </div>
              </motion.div>
            );
          })
        )}

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border/40 text-[12px] text-muted-foreground">
            <span>
              Página {pagination.page} de {pagination.pages} — {pagination.total} OPs
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => fetchOrders(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="size-8 rounded-md border border-border/60 bg-secondary/40 grid place-items-center hover:bg-secondary disabled:opacity-30 transition"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                onClick={() => fetchOrders(pagination.page + 1)}
                disabled={pagination.page >= pagination.pages}
                className="size-8 rounded-md border border-border/60 bg-secondary/40 grid place-items-center hover:bg-secondary disabled:opacity-30 transition"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        )}
      </LisionCard>

      <ExportModal open={exportOpen} onOpenChange={setExportOpen} />
    </div>
  );
}

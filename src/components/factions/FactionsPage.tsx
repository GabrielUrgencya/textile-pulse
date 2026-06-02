"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Factory, Star } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { LisionCard } from "@/components/ui/lision-card";
import { MetricBox } from "@/components/ui/metric-box";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { FilterBar } from "@/components/ui/filter-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFactions, type Faction } from "@/hooks/use-factions-data";
import { FactionForm } from "@/components/factions/FactionForm";
import { showToast } from "@/lib/toast";

function FactionsPage() {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, refetch } = useFactions({ search: debouncedSearch });
  const factions = data?.factions || [];
  const kpis = data?.kpis;

  const [formOpen, setFormOpen] = React.useState(false);
  const [editFaction, setEditFaction] = React.useState<Faction | null>(null);
  const [deactivateTarget, setDeactivateTarget] = React.useState<Faction | null>(null);
  const [deactivating, setDeactivating] = React.useState(false);

  const handleCreate = () => { setEditFaction(null); setFormOpen(true); };
  const handleEdit = (f: Faction) => { setEditFaction(f); setFormOpen(true); };

  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    setDeactivating(true);
    try {
      const res = await fetch(`/api/factions/${deactivateTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      });
      if (!res.ok) throw new Error("Erro ao desativar");
      showToast("success", `${deactivateTarget.name} desativada`);
      setDeactivateTarget(null);
      refetch();
    } catch {
      showToast("error", "Erro ao desativar facção");
    } finally {
      setDeactivating(false);
    }
  };

  const columns: DataTableColumn<Faction>[] = [
    {
      key: "name",
      header: "Nome",
      sortable: true,
      render: (row) => <span className="font-medium text-sm">{row.name}</span>,
    },
    {
      key: "type",
      header: "Tipo",
      render: (row) => <span className="text-sm text-muted-foreground">{row.type}</span>,
    },
    {
      key: "rating",
      header: "Rating",
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-1">
          <Star className="size-3.5 text-warning fill-warning" />
          <span className="text-sm font-mono">{Number(row.rating).toFixed(1)}</span>
        </div>
      ),
    },
    {
      key: "is_active",
      header: "Status",
      render: (row) => (
        <StatusBadge status={row.is_active ? "success" : "destructive"}>
          {row.is_active ? "Ativa" : "Inativa"}
        </StatusBadge>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-[120px] text-right",
      render: (row) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleEdit(row)}>
            Editar
          </Button>
          {row.is_active && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-destructive hover:text-destructive"
              onClick={() => setDeactivateTarget(row)}
            >
              Desativar
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader eyebrow="Terceirizados" title="Facções">
        <Button onClick={handleCreate} className="gap-2">
          <Plus className="size-4" />
          <span className="hidden sm:inline">Nova Facção</span>
        </Button>
      </PageHeader>

      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <MetricBox label="Facções Ativas" value={String(kpis.totalActive)} />
          <MetricBox label="Remessas em Andamento" value={String(kpis.shipmentsInProgress)} />
          <MetricBox label="Taxa Média Defeito" value={`${kpis.avgDefectRate}%`} />
          <MetricBox label="Valor Pendente" value={`R$ ${kpis.totalPendingValue.toLocaleString("pt-BR")}`} />
        </div>
      )}

      <LisionCard>
        <div className="p-4 border-b border-border/40">
          <FilterBar>
            <Input
              placeholder="Buscar facção..."
              className="input-field max-w-xs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </FilterBar>
        </div>

        <DataTable
          columns={columns}
          data={factions}
          loading={isLoading}
          keyExtractor={(row) => row.id}
          onRowClick={(row) => router.push(`/factions/${row.id}`)}
          emptyState={{
            icon: Factory,
            title: "Nenhuma facção cadastrada",
            description: "Adicione a primeira facção terceirizada",
            actionLabel: "Nova Facção",
            onAction: handleCreate,
          }}
          mobileCard={(row) => (
            <div
              className="rounded-xl border border-border/40 bg-secondary/30 p-4 cursor-pointer active:bg-secondary/50"
              onClick={() => router.push(`/factions/${row.id}`)}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-sm">{row.name}</span>
                <StatusBadge status={row.is_active ? "success" : "destructive"}>
                  {row.is_active ? "Ativa" : "Inativa"}
                </StatusBadge>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{row.type}</span>
                <div className="flex items-center gap-1">
                  <Star className="size-3 text-warning fill-warning" />
                  <span className="font-mono">{Number(row.rating).toFixed(1)}</span>
                </div>
              </div>
            </div>
          )}
        />
      </LisionCard>

      <FactionForm open={formOpen} onOpenChange={setFormOpen} faction={editFaction} onSuccess={refetch} />

      <ConfirmDialog
        open={!!deactivateTarget}
        onCancel={() => setDeactivateTarget(null)}
        onConfirm={handleDeactivate}
        title={`Desativar ${deactivateTarget?.name}?`}
        description="Remessas ativas serão mantidas, mas novos envios não serão possíveis."
        confirmLabel="Desativar"
        variant="destructive"
        loading={deactivating}
      />
    </>
  );
}

export { FactionsPage };

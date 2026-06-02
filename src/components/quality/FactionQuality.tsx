"use client";

import { useRouter } from "next/navigation";
import { Factory } from "lucide-react";
import { LisionCard, LisionCardHeader } from "@/components/ui/lision-card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import type { FactionQualityItem } from "@/hooks/use-quality-data";

interface FactionQualityProps {
  data: FactionQualityItem[] | null;
  loading: boolean;
}

const RATING_BADGE: Record<string, "success" | "warning" | "destructive" | "neutral"> = {
  A: "success",
  B: "neutral",
  C: "warning",
  D: "destructive",
};

function FactionQuality({ data, loading }: FactionQualityProps) {
  const router = useRouter();

  const columns: DataTableColumn<FactionQualityItem>[] = [
    {
      key: "name",
      header: "Facção",
      sortable: true,
      render: (row) => <span className="font-medium text-sm">{row.name}</span>,
    },
    {
      key: "total_defects",
      header: "Total Defeitos",
      sortable: true,
      render: (row) => (
        <span className="font-mono text-sm">{row.total_defects}</span>
      ),
    },
    {
      key: "contestation_rate",
      header: "Taxa Contestação",
      sortable: true,
      render: (row) => (
        <span className="font-mono text-sm">{row.contestation_rate}%</span>
      ),
    },
    {
      key: "rating",
      header: "Rating",
      render: (row) => (
        <StatusBadge status={RATING_BADGE[row.rating] || "neutral"} size="md">
          {row.rating}
        </StatusBadge>
      ),
    },
  ];

  return (
    <LisionCard>
      <LisionCardHeader eyebrow="Facções" title="Qualidade por Facção" />
      <DataTable
        columns={columns}
        data={data || []}
        loading={loading}
        keyExtractor={(row) => row.faction_id}
        onRowClick={(row) => router.push(`/factions/${row.faction_id}`)}
        emptyState={{
          icon: Factory,
          title: "Sem dados de facções",
          description: "Nenhum defeito associado a facções no período",
        }}
        mobileCard={(row) => (
          <div
            className="rounded-xl border border-border/40 bg-secondary/30 p-4 cursor-pointer active:bg-secondary/50"
            onClick={() => router.push(`/factions/${row.faction_id}`)}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-sm">{row.name}</span>
              <StatusBadge status={RATING_BADGE[row.rating] || "neutral"} size="md">
                {row.rating}
              </StatusBadge>
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span>Defeitos: <span className="font-mono text-foreground">{row.total_defects}</span></span>
              <span>Contestação: <span className="font-mono text-foreground">{row.contestation_rate}%</span></span>
            </div>
          </div>
        )}
      />
    </LisionCard>
  );
}

export { FactionQuality };

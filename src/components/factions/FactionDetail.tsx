"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Plus, PackageCheck, Truck, Key, Copy, Check } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { LisionCard, LisionCardHeader } from "@/components/ui/lision-card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FactionScoreCard } from "@/components/factions/FactionScoreCard";
import { FactionForm } from "@/components/factions/FactionForm";
import { ShipmentCreate } from "@/components/factions/ShipmentCreate";
import { ShipmentReceive } from "@/components/factions/ShipmentReceive";
import { useFactionDetail, type FactionShipment } from "@/hooks/use-factions-data";
import { showToast } from "@/lib/toast";

const SHIPMENT_STATUS_MAP: Record<string, "success" | "warning" | "destructive" | "neutral"> = {
  SENT: "warning",
  RECEIVED: "success",
  RETURNED: "neutral",
  LATE: "destructive",
  PENDING: "neutral",
};

interface FactionDetailProps {
  factionId: string;
}

function FactionDetail({ factionId }: FactionDetailProps) {
  const router = useRouter();
  const { data, isLoading, refetch } = useFactionDetail(factionId);

  const [editOpen, setEditOpen] = React.useState(false);
  const [shipmentCreateOpen, setShipmentCreateOpen] = React.useState(false);
  const [receiveTarget, setReceiveTarget] = React.useState<FactionShipment | null>(null);
  const [deactivateOpen, setDeactivateOpen] = React.useState(false);
  const [deactivating, setDeactivating] = React.useState(false);
  const [shipmentTab, setShipmentTab] = React.useState<"active" | "history">("active");
  const [tokenDialogOpen, setTokenDialogOpen] = React.useState(false);
  const [generatingToken, setGeneratingToken] = React.useState(false);
  const [generatedToken, setGeneratedToken] = React.useState<{ portalUrl: string; pin: string } | null>(null);
  const [copiedField, setCopiedField] = React.useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (!data) return null;

  const { faction, shipments, defects, financial, scores } = data;

  const activeShipments = shipments.filter((s) => ["PENDING", "SENT"].includes(s.status));
  const historyShipments = shipments.filter((s) => !["PENDING", "SENT"].includes(s.status));
  const displayedShipments = shipmentTab === "active" ? activeShipments : historyShipments;

  const handleDeactivate = async () => {
    setDeactivating(true);
    try {
      const res = await fetch(`/api/factions/${factionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      });
      if (!res.ok) throw new Error("Erro ao desativar");
      showToast("success", "Facção desativada");
      setDeactivateOpen(false);
      router.push("/factions");
    } catch {
      showToast("error", "Erro ao desativar");
    } finally {
      setDeactivating(false);
    }
  };

  const handleGenerateToken = async () => {
    setGeneratingToken(true);
    try {
      const res = await fetch("/api/admin/faction-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ faction_id: factionId, name: faction.name }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Erro ao gerar token");
      }
      const { pin, portalUrl } = await res.json();
      setGeneratedToken({ portalUrl, pin });
      setTokenDialogOpen(true);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro inesperado");
    } finally {
      setGeneratingToken(false);
    }
  };

  const handleCopy = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    showToast("success", "Copiado!");
    setTimeout(() => setCopiedField(null), 2000);
  };

  const shipmentColumns: DataTableColumn<FactionShipment>[] = [
    {
      key: "sent_at",
      header: "Data Envio",
      sortable: true,
      render: (row) => <span className="text-sm font-mono">{new Date(row.sent_at).toLocaleDateString("pt-BR")}</span>,
    },
    {
      key: "total_quantity",
      header: "Peças",
      render: (row) => <span className="text-sm font-mono">{row.total_quantity}</span>,
    },
    {
      key: "expected_return",
      header: "Prazo",
      render: (row) => <span className="text-sm">{new Date(row.expected_return).toLocaleDateString("pt-BR")}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <StatusBadge status={SHIPMENT_STATUS_MAP[row.status] || "neutral"}>
          {row.status}
        </StatusBadge>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-[140px] text-right",
      render: (row) =>
        row.status === "SENT" ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={(e) => { e.stopPropagation(); setReceiveTarget(row); }}
          >
            <PackageCheck className="size-3.5" />
            Receber
          </Button>
        ) : null,
    },
  ];

  const defectColumns: DataTableColumn<typeof defects[number]>[] = [
    {
      key: "created_at",
      header: "Data",
      render: (row) => <span className="text-sm font-mono">{new Date(row.created_at).toLocaleDateString("pt-BR")}</span>,
    },
    {
      key: "defect_type",
      header: "Tipo",
      render: (row) => <span className="text-sm">{row.defect_type}</span>,
    },
    {
      key: "severity",
      header: "Severidade",
      render: (row) => (
        <StatusBadge status={row.severity === "CRITICAL" ? "destructive" : row.severity === "HIGH" ? "warning" : "neutral"}>
          {row.severity}
        </StatusBadge>
      ),
    },
    {
      key: "status",
      header: "Contestação",
      render: (row) => (
        <StatusBadge status={row.status === "CONTESTED" ? "warning" : row.status === "RESOLVED" ? "success" : "neutral"}>
          {row.status}
        </StatusBadge>
      ),
    },
  ];

  return (
    <>
      <PageHeader eyebrow="Facções" title={faction.name}>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => router.push("/factions")}>
            <ArrowLeft className="size-4 mr-1" /> Voltar
          </Button>
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="size-3.5 mr-1" /> Editar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerateToken}
            disabled={generatingToken}
          >
            <Key className="size-3.5 mr-1" />
            {generatingToken ? "Gerando..." : "Gerar Token Portal"}
          </Button>
          <Button size="sm" onClick={() => setShipmentCreateOpen(true)}>
            <Plus className="size-3.5 mr-1" /> Nova Remessa
          </Button>
        </div>
      </PageHeader>

      <div className="space-y-6">
        {/* Score Card */}
        <FactionScoreCard
          rating={Number(faction.rating ?? 0)}
          deliveryScore={scores?.deliveryScore ?? 0}
          qualityScore={scores?.qualityScore ?? 100}
          volumeTotal={scores?.volumeTotal ?? 0}
        />

        {/* Contact Info */}
        <LisionCard>
          <LisionCardHeader eyebrow="Informações" title="Contato" />
          <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-xs text-muted-foreground mb-0.5">Tipo</div>
              <div>{faction.type}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-0.5">Contato</div>
              <div>{faction.contact_name || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-0.5">Telefone</div>
              <div>{faction.contact_phone || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-0.5">Endereço</div>
              <div>{faction.address || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-0.5">Preço/peça</div>
              <div className="font-mono">
                {faction.price_per_piece ? `R$ ${Number(faction.price_per_piece).toFixed(2)}` : "—"}
              </div>
            </div>
          </div>
        </LisionCard>

        {/* Shipments */}
        <LisionCard>
          <LisionCardHeader
            eyebrow="Remessas"
            title="Envios"
            right={
              <div className="flex gap-1">
                <Button
                  variant={shipmentTab === "active" ? "default" : "ghost"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setShipmentTab("active")}
                >
                  Ativas ({activeShipments.length})
                </Button>
                <Button
                  variant={shipmentTab === "history" ? "default" : "ghost"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setShipmentTab("history")}
                >
                  Histórico ({historyShipments.length})
                </Button>
              </div>
            }
          />
          <DataTable
            columns={shipmentColumns}
            data={displayedShipments}
            keyExtractor={(row) => row.id}
            emptyState={{
              icon: Truck,
              title: shipmentTab === "active" ? "Sem remessas ativas" : "Sem histórico",
              description: "Crie uma nova remessa para esta facção",
            }}
          />
        </LisionCard>

        {/* Defects */}
        {defects.length > 0 && (
          <LisionCard>
            <LisionCardHeader eyebrow="Qualidade" title="Histórico de Defeitos" />
            <DataTable
              columns={defectColumns}
              data={defects}
              keyExtractor={(row) => row.id}
            />
          </LisionCard>
        )}

        {/* Financial Summary */}
        <LisionCard>
          <LisionCardHeader eyebrow="Financeiro" title="Resumo" />
          <div className="p-4 grid grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-muted-foreground mb-0.5">Valor Bruto</div>
              <div className="font-mono text-lg">R$ {financial.grossValue.toLocaleString("pt-BR")}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-0.5">Deduções</div>
              <div className="font-mono text-lg text-destructive">-R$ {financial.deductions.toLocaleString("pt-BR")}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-0.5">Valor Líquido</div>
              <div className="font-mono text-lg font-semibold">R$ {financial.netValue.toLocaleString("pt-BR")}</div>
            </div>
          </div>
        </LisionCard>

        {/* Deactivate button */}
        {faction.is_active && (
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              className="text-destructive border-destructive/30 hover:bg-destructive/5"
              onClick={() => setDeactivateOpen(true)}
            >
              Desativar Facção
            </Button>
          </div>
        )}
      </div>

      <FactionForm open={editOpen} onOpenChange={setEditOpen} faction={faction} onSuccess={refetch} />
      <ShipmentCreate open={shipmentCreateOpen} onOpenChange={setShipmentCreateOpen} factionId={factionId} onSuccess={refetch} />
      <ShipmentReceive open={!!receiveTarget} onOpenChange={() => setReceiveTarget(null)} shipment={receiveTarget} onSuccess={refetch} />
      <ConfirmDialog
        open={deactivateOpen}
        onCancel={() => setDeactivateOpen(false)}
        onConfirm={handleDeactivate}
        title={`Desativar ${faction.name}?`}
        description="Remessas ativas serão mantidas, mas novos envios não serão possíveis."
        confirmLabel="Desativar"
        variant="destructive"
        loading={deactivating}
      />

      <Dialog open={tokenDialogOpen} onOpenChange={(open) => { if (!open) setGeneratedToken(null); setTokenDialogOpen(open); }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Token Portal Gerado</DialogTitle>
            <DialogDescription>Credenciais de acesso ao portal da facção.</DialogDescription>
          </DialogHeader>
          {generatedToken && (
            <div className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <div className="text-xs text-muted-foreground">URL do Portal</div>
                <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
                  <code className="text-sm font-mono flex-1 break-all">{generatedToken.portalUrl}</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 shrink-0"
                    onClick={() => handleCopy(generatedToken.portalUrl, "url")}
                  >
                    {copiedField === "url" ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-xs text-muted-foreground">PIN de Acesso</div>
                <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
                  <code className="text-2xl font-mono font-bold tracking-[0.3em] flex-1">{generatedToken.pin}</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 shrink-0"
                    onClick={() => handleCopy(generatedToken.pin, "pin")}
                  >
                    {copiedField === "pin" ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning">
                Anote o PIN — ele não será exibido novamente.
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export { FactionDetail };

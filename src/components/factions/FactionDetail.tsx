"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Plus, PackageCheck, Truck, Key, Wallet, Link2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { LisionCard, LisionCardHeader } from "@/components/ui/lision-card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FactionScoreCard } from "@/components/factions/FactionScoreCard";
import { ShipmentTimeline } from "@/components/shipments/ShipmentTimeline";
import { FactionForm } from "@/components/factions/FactionForm";
import { ShipmentCreate } from "@/components/factions/ShipmentCreate";
import { ShipmentReceive } from "@/components/factions/ShipmentReceive";
import { ShipmentPaymentDialog } from "@/components/factions/ShipmentPaymentDialog";
import { ShipmentDrawer } from "@/components/factions/ShipmentDrawer";
import { ShipmentGroupedTable } from "@/components/factions/ShipmentGroupedTable";
import { DeliveryCodeDisplay } from "@/components/shipments/DeliveryCodeDisplay";
import { useFactionDetail, type FactionShipment } from "@/hooks/use-factions-data";
import { formatDateBR } from "@/lib/tz";
import { showToast } from "@/lib/toast";
import { getShipmentStatusMeta, isActiveShipment } from "@/lib/shipment-status";

interface FactionDetailProps {
  factionId: string;
}

function FactionDetail({ factionId }: FactionDetailProps) {
  const router = useRouter();
  const { data, isLoading, refetch } = useFactionDetail(factionId);

  const [editOpen, setEditOpen] = React.useState(false);
  const [shipmentCreateOpen, setShipmentCreateOpen] = React.useState(false);
  const [receiveTarget, setReceiveTarget] = React.useState<FactionShipment | null>(null);
  const [paymentTarget, setPaymentTarget] = React.useState<FactionShipment | null>(null);
  const [deactivateOpen, setDeactivateOpen] = React.useState(false);
  const [deactivating, setDeactivating] = React.useState(false);
  const [shipmentTab, setShipmentTab] = React.useState<"active" | "history">("active");
  // Agrupar remessas do mesmo envio (shipment_group_id) na exibição. Padrão =
  // agrupado (foi enviado junto); "separado" volta à lista plana de hoje.
  const [shipmentView, setShipmentView] = React.useState<"grouped" | "separated">("grouped");
  // Acesso da facção ao portal (Copiar acesso / Gerar novo PIN).
  const [copyingAccess, setCopyingAccess] = React.useState(false);
  const [rotating, setRotating] = React.useState(false);
  const [rotateOpen, setRotateOpen] = React.useState(false);
  // Código de entrega (tela do motorista): dialog por remessa
  const [codeTarget, setCodeTarget] = React.useState<FactionShipment | null>(null);
  const [codeData, setCodeData] = React.useState<{ deliveryCode: string | null; expiresAt: string | null; expired: boolean } | null>(null);
  const [codeLoading, setCodeLoading] = React.useState(false);
  const [regenerating, setRegenerating] = React.useState(false);
  // Encerramento de remessa (épico Robustez F2)
  const [closeTarget, setCloseTarget] = React.useState<FactionShipment | null>(null);
  const [closing, setClosing] = React.useState(false);
  // Drawer da remessa (épico Robustez F3)
  const [drawerTarget, setDrawerTarget] = React.useState<string | null>(null);

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

  const activeShipments = shipments.filter((s) => isActiveShipment(s.status));
  const historyShipments = shipments.filter((s) => !isActiveShipment(s.status));
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

  const handleCloseShipment = async () => {
    if (!closeTarget) return;
    setClosing(true);
    try {
      const res = await fetch(`/api/shipments/${closeTarget.id}/close`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const missing = Array.isArray(body.missing) ? ` — ${body.missing.join("; ")}` : "";
        throw new Error(`${body.error || "Erro ao encerrar"}${missing}`);
      }
      const warnings: string[] = body.data?.warnings || [];
      showToast("success", `Remessa encerrada${warnings.length ? ` (${warnings.join("; ")})` : ""}`);
      setCloseTarget(null);
      refetch();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao encerrar remessa");
    } finally {
      setClosing(false);
    }
  };

  const handleReopenShipment = async (shipmentId: string) => {
    try {
      const res = await fetch(`/api/shipments/${shipmentId}/reopen`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Erro ao reabrir");
      showToast("success", "Remessa reaberta");
      refetch();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao reabrir remessa");
    }
  };

  // Monta a mensagem pronta de WhatsApp (link + PIN juntos) e copia.
  const copyAccessMessage = async (token: string, pin: string) => {
    const link = `${window.location.origin}/portal?token=${token}`;
    const msg = `Portal da Facção ${faction.name} 👇\n${link}\nSeu PIN: ${pin}`;
    await navigator.clipboard.writeText(msg);
  };

  // Ação do dia a dia (momentos 1 e 2): recupera o acesso ATUAL (link + PIN) e
  // copia. Idempotente — não troca token nem PIN. Serve para o 1º envio e para
  // reenviar quando a facção perde, sem quebrar o link que ela já salvou.
  const handleCopyAccess = async () => {
    setCopyingAccess(true);
    try {
      const res = await fetch("/api/admin/faction-tokens/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ faction_id: factionId, action: "get" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Erro ao copiar acesso");
      await copyAccessMessage(json.data.token, json.data.pin);
      showToast("success", "Acesso copiado (link + PIN) — cole no WhatsApp");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao copiar acesso");
    } finally {
      setCopyingAccess(false);
    }
  };

  // Exceção (momento 3): gera um PIN novo no mesmo link e invalida o anterior.
  // Já copia o acesso novo, pronto para reenviar.
  const handleRotatePin = async () => {
    setRotating(true);
    try {
      const res = await fetch("/api/admin/faction-tokens/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ faction_id: factionId, action: "rotate" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Erro ao gerar novo PIN");
      await copyAccessMessage(json.data.token, json.data.pin);
      setRotateOpen(false);
      showToast("success", "PIN novo gerado e acesso copiado — reenvie no WhatsApp");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao gerar novo PIN");
    } finally {
      setRotating(false);
    }
  };

  const openDeliveryCode = async (shipment: FactionShipment) => {
    setCodeTarget(shipment);
    setCodeData(null);
    setCodeLoading(true);
    try {
      const res = await fetch(`/api/shipments/${shipment.id}/delivery-code`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Erro ao buscar código");
      setCodeData(json.data);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao buscar código");
      setCodeTarget(null);
    } finally {
      setCodeLoading(false);
    }
  };

  const handleRegenerateCode = async () => {
    if (!codeTarget) return;
    setRegenerating(true);
    try {
      const res = await fetch(`/api/shipments/${codeTarget.id}/delivery-code`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Erro ao gerar novo código");
      setCodeData({ deliveryCode: json.data.deliveryCode, expiresAt: json.data.expiresAt, expired: false });
      showToast("success", "Novo código gerado");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao gerar novo código");
    } finally {
      setRegenerating(false);
    }
  };

  const shipmentColumns: DataTableColumn<FactionShipment>[] = [
    {
      key: "timeline",
      header: "Progresso",
      className: "min-w-[180px]",
      render: (row) => (
        <ShipmentTimeline status={row.status} expectedReturn={row.expected_return || row.expected_return_at || ""} />
      ),
    },
    {
      key: "sent_at",
      header: "Data Envio",
      sortable: true,
      render: (row) => <span className="text-sm font-mono">{formatDateBR(row.sent_at)}</span>,
    },
    {
      key: "total_quantity",
      header: "Peças",
      render: (row) => <span className="text-sm font-mono">{row.total_quantity}</span>,
    },
    {
      key: "expected_return",
      header: "Prazo",
      render: (row) => {
        const prazo = row.expected_return || row.expected_return_at;
        return <span className="text-sm">{formatDateBR(prazo)}</span>;
      },
    },
    {
      key: "status",
      header: "Status",
      render: (row) => {
        const isUnconfirmed =
          row.status === "SENT" &&
          !row.faction_confirmed_at &&
          new Date(row.sent_at).getTime() < Date.now() - 4 * 60 * 60 * 1000;

        const meta = getShipmentStatusMeta(row.status);
        return (
          <div className="space-y-1">
            <StatusBadge status={meta.tone}>
              {meta.label}
            </StatusBadge>
            {isUnconfirmed && (
              <div className="flex items-center gap-1 animate-pulse">
                <span className="inline-block size-1.5 rounded-full bg-amber-500" />
                <span className="text-[10px] text-amber-500 font-medium">
                  Aguardando confirmação —{" "}
                  {Math.round((Date.now() - new Date(row.sent_at).getTime()) / 3600000)}h
                </span>
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "actions",
      header: "",
      className: "w-[200px] text-right",
      render: (row) => {
        if (row.status === "SENT") {
          return (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={(e) => { e.stopPropagation(); openDeliveryCode(row); }}
              title="Código de entrega para repassar ao motorista/facção"
            >
              <Key className="size-3.5" />
              Código
            </Button>
          );
        }
        if (row.status === "RETURN_DECLARED") {
          return (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={(e) => { e.stopPropagation(); setReceiveTarget(row); }}
              title="Receber a devolução com o código do motorista"
            >
              <PackageCheck className="size-3.5" />
              Receber devolução
            </Button>
          );
        }
        // Frente 3: remessa recebida, conferência em andamento — finalizar.
        if (row.status === "AWAITING_INSPECTION") {
          return (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1 text-warning hover:text-warning"
              onClick={(e) => { e.stopPropagation(); setReceiveTarget(row); }}
              title="Registrar defeitos e finalizar a conferência"
            >
              <PackageCheck className="size-3.5" />
              Finalizar conferência
            </Button>
          );
        }
        if (row.status === "RETURNED" || row.status === "PARTIALLY_RETURNED") {
          return (
            <div className="flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={(e) => { e.stopPropagation(); setPaymentTarget(row); }}
                title="Gerenciar pagamento (liberar / editar / marcar pago)"
              >
                <Wallet className="size-3.5" />
                Pagamento
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={(e) => { e.stopPropagation(); setCloseTarget(row); }}
                title="Encerrar a remessa (vai para o histórico nos dois lados)"
              >
                <PackageCheck className="size-3.5" />
                Encerrar
              </Button>
            </div>
          );
        }
        if (row.status === "CLOSED") {
          return (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={(e) => { e.stopPropagation(); handleReopenShipment(row.id); }}
              title="Reabrir a remessa encerrada (volta ao status anterior)"
            >
              Reabrir
            </Button>
          );
        }
        return null;
      },
    },
  ];

  const defectColumns: DataTableColumn<typeof defects[number]>[] = [
    {
      key: "created_at",
      header: "Data",
      render: (row) => <span className="text-sm font-mono">{formatDateBR(row.created_at)}</span>,
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
          {/* Ação do dia a dia: reenviar o acesso atual (link + PIN juntos). */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyAccess}
            disabled={copyingAccess}
            title="Copiar link + PIN do Portal desta facção para mandar no WhatsApp"
          >
            <Link2 className="size-3.5 mr-1" />
            {copyingAccess ? "Copiando..." : "Copiar acesso"}
          </Button>
          {/* Exceção: trocar o PIN (invalida o anterior). Discreto de propósito. */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRotateOpen(true)}
            disabled={rotating}
            title="Gerar um PIN novo — o acesso atual da facção deixa de funcionar"
          >
            <Key className="size-3.5 mr-1" />
            Gerar novo PIN
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
              <div className="flex items-center gap-2">
                {/* Agrupado / Separado (só exibição) */}
                <div className="flex gap-1 rounded-lg bg-secondary/40 p-0.5">
                  <Button
                    variant={shipmentView === "grouped" ? "default" : "ghost"}
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => setShipmentView("grouped")}
                    title="Juntar as remessas do mesmo envio num card só"
                  >
                    Agrupado
                  </Button>
                  <Button
                    variant={shipmentView === "separated" ? "default" : "ghost"}
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => setShipmentView("separated")}
                    title="Ver cada remessa (lote) em uma linha"
                  >
                    Separado
                  </Button>
                </div>
                <div className="h-4 w-px bg-border/60" />
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
              </div>
            }
          />
          {shipmentView === "grouped" ? (
            <ShipmentGroupedTable
              columns={shipmentColumns}
              shipments={displayedShipments}
              onRowClick={(row) => setDrawerTarget(row.id)}
              emptyState={{
                icon: Truck,
                title: shipmentTab === "active" ? "Sem remessas ativas" : "Sem histórico",
                description: "Crie uma nova remessa para esta facção",
              }}
            />
          ) : (
            <DataTable
              columns={shipmentColumns}
              data={displayedShipments}
              keyExtractor={(row) => row.id}
              onRowClick={(row) => setDrawerTarget(row.id)}
              emptyState={{
                icon: Truck,
                title: shipmentTab === "active" ? "Sem remessas ativas" : "Sem histórico",
                description: "Crie uma nova remessa para esta facção",
              }}
            />
          )}
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
          <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-muted-foreground mb-0.5">Deduções</div>
              <div className="font-mono text-lg text-destructive">-R$ {financial.deductions.toLocaleString("pt-BR")}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-0.5">A liberar/pago</div>
              <div className="font-mono text-lg font-semibold text-success">R$ {(financial.totalReleased ?? financial.netValue).toLocaleString("pt-BR")}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-0.5">Retido</div>
              <div className="font-mono text-lg text-warning">R$ {(financial.totalRetained ?? 0).toLocaleString("pt-BR")}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-0.5">Já pago</div>
              <div className="font-mono text-lg">R$ {(financial.totalPaid ?? 0).toLocaleString("pt-BR")}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-0.5">Saldo da facção</div>
              {(() => {
                const bal = Number(faction.current_balance || 0);
                if (bal > 0) return <div className="font-mono text-lg font-semibold text-success">A receber: R$ {bal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>;
                if (bal < 0) return <div className="font-mono text-lg font-semibold text-warning">A compensar: R$ {Math.abs(bal).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>;
                return <div className="font-mono text-lg text-muted-foreground">—</div>;
              })()}
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
      <ShipmentPaymentDialog open={!!paymentTarget} onOpenChange={() => setPaymentTarget(null)} shipment={paymentTarget} onSuccess={refetch} />

      {/* Drawer da remessa (épico Robustez F3): timeline + observações + ações */}
      <ShipmentDrawer
        shipmentId={drawerTarget}
        onOpenChange={(open) => { if (!open) setDrawerTarget(null); }}
        onEditPayment={() => {
          const row = shipments.find((s) => s.id === drawerTarget) || null;
          setDrawerTarget(null);
          setPaymentTarget(row);
        }}
        onReceive={() => {
          const row = shipments.find((s) => s.id === drawerTarget) || null;
          setDrawerTarget(null);
          setReceiveTarget(row);
        }}
        onChanged={refetch}
      />

      {/* Código de entrega — o operador/motorista mostra este código à facção na entrega */}
      <Dialog open={!!codeTarget} onOpenChange={(open) => { if (!open) { setCodeTarget(null); setCodeData(null); } }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Código de Entrega</DialogTitle>
            <DialogDescription>
              Passe este código ao motorista. Ele o entrega à facção, que o digita no portal para confirmar o recebimento.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2">
            {codeLoading ? (
              <Skeleton className="h-40 w-full rounded-lg" />
            ) : (
              <DeliveryCodeDisplay
                code={codeData?.deliveryCode ?? null}
                expiresAt={codeData?.expiresAt ?? null}
                expired={codeData?.expired}
                onRegenerate={handleRegenerateCode}
                regenerating={regenerating}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
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

      {/* Encerramento de remessa (épico Robustez F2): critérios validados no servidor */}
      <ConfirmDialog
        open={!!closeTarget}
        onCancel={() => setCloseTarget(null)}
        onConfirm={handleCloseShipment}
        title="Encerrar remessa?"
        description="A remessa vai para o histórico nos dois lados (sistema e portal da facção). Requisitos: devolução recebida, peças conferidas e valor financeiro lançado — o servidor valida e informa o que faltar. É possível reabrir depois."
        confirmLabel="Encerrar"
        loading={closing}
      />

      <ConfirmDialog
        open={rotateOpen}
        onCancel={() => setRotateOpen(false)}
        onConfirm={handleRotatePin}
        title={`Gerar um novo PIN para ${faction.name}?`}
        description={
          "Isso cria um PIN novo e o acesso atual da facção deixa de funcionar imediatamente. " +
          "Use quando o PIN vazou ou a facção saiu. O link continua o mesmo — só o PIN muda. " +
          "Ao confirmar, o novo acesso já é copiado para você reenviar no WhatsApp."
        }
        confirmLabel="Gerar novo PIN"
        variant="warning"
        loading={rotating}
      />
    </>
  );
}

export { FactionDetail };

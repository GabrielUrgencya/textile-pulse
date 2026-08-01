"use client";

import * as React from "react";
import { Plus, Users, MoreHorizontal, Pencil, UserX, Eraser, RotateCcw } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { LisionCard } from "@/components/ui/lision-card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { FilterBar } from "@/components/ui/filter-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTeamMembers, type TeamMember } from "@/hooks/use-team-data";
import { MemberForm } from "@/components/team/MemberForm";
import { PinResetPopover } from "@/components/team/PinResetPopover";
import { showToast } from "@/lib/toast";
import { usePermissions } from "@/hooks/use-permissions";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  GERENTE: "Gerente",
  COORDENADOR: "Coordenador",
  OPERADOR: "Operador",
};

const ROLE_BADGE_STATUS: Record<string, "success" | "warning" | "neutral" | "destructive"> = {
  ADMIN: "destructive",
  GERENTE: "warning",
  COORDENADOR: "neutral",
  OPERADOR: "neutral",
};

function TeamPage() {
  const [search, setSearch] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState("");
  const [showInactive, setShowInactive] = React.useState(false);
  const [debouncedSearch, setDebouncedSearch] = React.useState("");

  // Debounce search
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: members, isLoading, refetch } = useTeamMembers({
    search: debouncedSearch,
    role: roleFilter,
    active: !showInactive,
  });

  // Sheet state
  const [formOpen, setFormOpen] = React.useState(false);
  const [editMember, setEditMember] = React.useState<TeamMember | null>(null);

  // Deactivate dialog
  const [deactivateTarget, setDeactivateTarget] = React.useState<TeamMember | null>(null);
  const [deactivating, setDeactivating] = React.useState(false);
  // Zerar dívida de meta: ação de gestão — mesmo gate do backend (settings:manage).
  const { can } = usePermissions();
  const canManage = can("settings:manage");
  const [resetTarget, setResetTarget] = React.useState<TeamMember | null>(null);
  const [resetDeficits, setResetDeficits] = React.useState<{ daily: number; weekly: number; monthly: number } | null>(null);
  const [resetting, setResetting] = React.useState(false);

  /** Abre a confirmação buscando a dívida atual dos TRÊS períodos (1 fetch). */
  const askReset = async (member: TeamMember) => {
    setResetTarget(member);
    setResetDeficits(null);
    try {
      const res = await fetch(`/api/my-plan?userId=${member.id}`);
      const json = res.ok ? await res.json() : null;
      const d = json?.data?.meta?.deficits;
      setResetDeficits({
        daily: Math.round(d?.daily ?? 0),
        weekly: Math.round(d?.weekly ?? 0),
        monthly: Math.round(d?.monthly ?? 0),
      });
    } catch {
      setResetDeficits({ daily: 0, weekly: 0, monthly: 0 });
    }
  };

  const confirmReset = async () => {
    if (!resetTarget) return;
    setResetting(true);
    try {
      const res = await fetch("/api/my-plan/reset-goal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // "all": limpa dia + semana + mês numa só operação. Zerar só o dia
        // deixava o operador ainda vendo dívida da semana na tela dele.
        body: JSON.stringify({ period: "all", userId: resetTarget.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Erro ao zerar dívida");
      showToast("success", `Dívida de ${resetTarget.full_name} zerada (dia, semana e mês) — a meta base continua`);
      setResetTarget(null);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao zerar dívida");
    } finally {
      setResetting(false);
    }
  };

  // Zerar progresso do dia: mesma família de ação do "Zerar dívida", mesmo gate.
  // A contagem já vem no payload da lista (today_scans) — sem fetch por linha.
  const [progressTarget, setProgressTarget] = React.useState<TeamMember | null>(null);
  const [clearingProgress, setClearingProgress] = React.useState(false);

  const confirmResetProgress = async () => {
    if (!progressTarget) return;
    setClearingProgress(true);
    try {
      const res = await fetch("/api/my-plan/reset-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: progressTarget.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Erro ao zerar progresso");
      const n = body?.data?.scans_disregarded ?? 0;
      showToast(
        "success",
        `Produção de hoje de ${progressTarget.full_name} zerada (${n} ${n === 1 ? "bipagem" : "bipagens"}) — a dívida não foi alterada`,
      );
      setProgressTarget(null);
      refetch();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao zerar progresso");
    } finally {
      setClearingProgress(false);
    }
  };

  const handleEdit = (member: TeamMember) => {
    setEditMember(member);
    setFormOpen(true);
  };

  const handleCreate = () => {
    setEditMember(null);
    setFormOpen(true);
  };

  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    setDeactivating(true);
    try {
      const res = await fetch(`/api/team/members/${deactivateTarget.id}/deactivate`, {
        method: "PATCH",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Erro ao desativar");
      }
      showToast("success", `${deactivateTarget.full_name} desativado`);
      setDeactivateTarget(null);
      refetch();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao desativar");
    } finally {
      setDeactivating(false);
    }
  };

  const columns: DataTableColumn<TeamMember>[] = [
    {
      key: "full_name",
      header: "Nome",
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-full bg-secondary flex items-center justify-center text-xs font-medium text-muted-foreground">
            {row.full_name?.charAt(0)?.toUpperCase() || "?"}
          </div>
          <div>
            <div className="font-medium text-sm">{row.full_name}</div>
            {row.email && (
              <div className="text-xs text-muted-foreground">{row.email}</div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "role",
      header: "Cargo",
      sortable: true,
      render: (row) => (
        <StatusBadge status={ROLE_BADGE_STATUS[row.role] || "neutral"}>
          {ROLE_LABELS[row.role] || row.role}
        </StatusBadge>
      ),
    },
    {
      key: "sector",
      header: "Setor",
      render: (row) => (
        <span className="text-sm text-muted-foreground">{row.sector || "—"}</span>
      ),
    },
    {
      key: "is_active",
      header: "Status",
      render: (row) => (
        <StatusBadge status={row.is_active ? "success" : "destructive"}>
          {row.is_active ? "Ativo" : "Inativo"}
        </StatusBadge>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-[180px] text-right",
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          {/* Desktop actions */}
          <div className="hidden md:flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={(e) => {
                e.stopPropagation();
                handleEdit(row);
              }}
            >
              <Pencil className="size-3.5" />
              Editar
            </Button>
            {row.role === "OPERADOR" && row.is_active && (
              <span onClick={(e) => e.stopPropagation()}>
                <PinResetPopover memberId={row.id} memberName={row.full_name} />
              </span>
            )}
            {/* Zerar dívida: só faz sentido para quem tem meta de produção. */}
            {row.role === "OPERADOR" && canManage && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs gap-1.5"
                title="Limpa o acumulado atrasado. A meta base continua valendo."
                onClick={(e) => {
                  e.stopPropagation();
                  askReset(row);
                }}
              >
                <Eraser className="size-3.5" />
                Zerar dívida
              </Button>
            )}
            {/* Zerar progresso: apaga da métrica a produção de HOJE (não a dívida). */}
            {row.role === "OPERADOR" && canManage && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs gap-1.5"
                title="Faz a produção de hoje deixar de contar. O histórico do lote é preservado."
                onClick={(e) => {
                  e.stopPropagation();
                  setProgressTarget(row);
                }}
              >
                <RotateCcw className="size-3.5" />
                Zerar progresso
              </Button>
            )}
            {row.is_active && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-destructive hover:text-destructive gap-1.5"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeactivateTarget(row);
                }}
              >
                <UserX className="size-3.5" />
                Desativar
              </Button>
            )}
          </div>

          {/* Mobile actions */}
          <div className="md:hidden" onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleEdit(row)}>
                  <Pencil className="size-3.5 mr-2" />
                  Editar
                </DropdownMenuItem>
                {row.role === "OPERADOR" && row.is_active && (
                  <DropdownMenuItem
                    onClick={async () => {
                      const res = await fetch(`/api/team/members/${row.id}/reset-pin`, {
                        method: "PATCH",
                      });
                      if (res.ok) {
                        const json = await res.json();
                        showToast("success", `Novo PIN: ${json.data.pin}`);
                      }
                    }}
                  >
                    Reset PIN
                  </DropdownMenuItem>
                )}
                {row.role === "OPERADOR" && canManage && (
                  <DropdownMenuItem onClick={() => askReset(row)}>
                    <Eraser className="size-3.5 mr-2" />
                    Zerar dívida
                  </DropdownMenuItem>
                )}
                {row.role === "OPERADOR" && canManage && (
                  <DropdownMenuItem onClick={() => setProgressTarget(row)}>
                    <RotateCcw className="size-3.5 mr-2" />
                    Zerar progresso
                  </DropdownMenuItem>
                )}
                {row.is_active && (
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setDeactivateTarget(row)}
                  >
                    <UserX className="size-3.5 mr-2" />
                    Desativar
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-6 lg:py-8">
      <PageHeader eyebrow="Gestão" title="Equipe">
        <Button onClick={handleCreate} className="gap-2">
          <Plus className="size-4" />
          <span className="hidden sm:inline">Novo Membro</span>
        </Button>
      </PageHeader>

      <LisionCard>
        <div className="p-4 border-b border-border/40">
          <FilterBar>
            <Input
              placeholder="Buscar por nome..."
              className="input-field max-w-xs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="input-field w-[160px]">
                <SelectValue placeholder="Todos os cargos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
                <SelectItem value="GERENTE">Gerente</SelectItem>
                <SelectItem value="COORDENADOR">Coordenador</SelectItem>
                <SelectItem value="OPERADOR">Operador</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant={showInactive ? "default" : "outline"}
              size="sm"
              onClick={() => setShowInactive(!showInactive)}
              className="text-xs"
            >
              {showInactive ? "Mostrando Inativos" : "Ativos"}
            </Button>
          </FilterBar>
        </div>

        <DataTable
          columns={columns}
          data={members || []}
          loading={isLoading}
          keyExtractor={(row) => row.id}
          emptyState={{
            icon: Users,
            title: "Nenhum membro encontrado",
            description: showInactive
              ? "Sem membros inativos"
              : "Adicione o primeiro membro da equipe",
            actionLabel: !showInactive ? "Novo Membro" : undefined,
            onAction: !showInactive ? handleCreate : undefined,
          }}
          mobileCard={(row) => (
            <div className="rounded-xl border border-border/40 bg-secondary/30 p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="size-9 rounded-full bg-secondary flex items-center justify-center text-sm font-medium text-muted-foreground">
                    {row.full_name?.charAt(0)?.toUpperCase() || "?"}
                  </div>
                  <div>
                    <div className="font-medium text-sm">{row.full_name}</div>
                    <div className="text-xs text-muted-foreground">{row.sector || "—"}</div>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-8">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleEdit(row)}>
                      <Pencil className="size-3.5 mr-2" />
                      Editar
                    </DropdownMenuItem>
                    {row.role === "OPERADOR" && row.is_active && (
                      <DropdownMenuItem
                        onClick={async () => {
                          const res = await fetch(`/api/team/members/${row.id}/reset-pin`, {
                            method: "PATCH",
                          });
                          if (res.ok) {
                            const json = await res.json();
                            showToast("success", `Novo PIN: ${json.data.pin}`);
                          }
                        }}
                      >
                        Reset PIN
                      </DropdownMenuItem>
                    )}
                    {row.is_active && (
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setDeactivateTarget(row)}
                      >
                        <UserX className="size-3.5 mr-2" />
                        Desativar
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={ROLE_BADGE_STATUS[row.role] || "neutral"}>
                  {ROLE_LABELS[row.role] || row.role}
                </StatusBadge>
                <StatusBadge status={row.is_active ? "success" : "destructive"}>
                  {row.is_active ? "Ativo" : "Inativo"}
                </StatusBadge>
              </div>
            </div>
          )}
        />
      </LisionCard>

      <MemberForm
        open={formOpen}
        onOpenChange={setFormOpen}
        member={editMember}
        onSuccess={refetch}
      />

      <ConfirmDialog
        open={!!deactivateTarget}
        onCancel={() => setDeactivateTarget(null)}
        onConfirm={handleDeactivate}
        title={`Desativar ${deactivateTarget?.full_name}?`}
        description="Esta pessoa perderá acesso ao sistema imediatamente. Dados históricos serão preservados."
        confirmLabel="Desativar"
        variant="destructive"
        loading={deactivating}
      />

      <ConfirmDialog
        open={!!resetTarget}
        onCancel={() => setResetTarget(null)}
        onConfirm={confirmReset}
        title={`Zerar a dívida de ${resetTarget?.full_name}?`}
        description={
          resetDeficits === null
            ? "Calculando a dívida atual…"
            : resetDeficits.daily + resetDeficits.weekly + resetDeficits.monthly > 0
              ? `Dívida acumulada — Dia: ${resetDeficits.daily.toLocaleString("pt-BR")} · ` +
                `Semana: ${resetDeficits.weekly.toLocaleString("pt-BR")} · ` +
                `Mês: ${resetDeficits.monthly.toLocaleString("pt-BR")} peças. ` +
                "Os TRÊS períodos serão limpos. A META BASE continua valendo — a cobrança " +
                "recomeça do valor normal, sem o atrasado."
              : "Esta pessoa não tem dívida acumulada — não há nada a zerar."
        }
        confirmLabel="Zerar dívida"
        variant="warning"
        loading={resetting}
      />

      <ConfirmDialog
        open={!!progressTarget}
        onCancel={() => setProgressTarget(null)}
        onConfirm={confirmResetProgress}
        title={`Zerar o progresso de ${progressTarget?.full_name} hoje?`}
        description={
          (progressTarget?.today_scans ?? 0) > 0
            ? `${progressTarget?.today_scans} ${(progressTarget?.today_scans ?? 0) === 1 ? "bipagem" : "bipagens"} de hoje ` +
              "deixarão de contar — a produção do dia volta a ZERO. As bipagens continuam no " +
              "histórico do lote; apenas saem das metas, do ranking e dos relatórios. " +
              "Esta ação fica registrada com seu nome e NÃO afeta a dívida acumulada."
            : "Esta pessoa não tem produção registrada hoje — não há nada a zerar."
        }
        confirmLabel="Zerar progresso"
        variant="destructive"
        loading={clearingProgress}
        confirmDisabled={(progressTarget?.today_scans ?? 0) === 0}
      />
    </div>
  );
}

export { TeamPage };

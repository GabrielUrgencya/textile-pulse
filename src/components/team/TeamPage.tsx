"use client";

import * as React from "react";
import { Plus, Users, MoreHorizontal, Pencil, UserX } from "lucide-react";
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
    </div>
  );
}

export { TeamPage };

"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { MemberForm } from "@/components/team/MemberForm";
import { PinResetPopover } from "@/components/team/PinResetPopover";
import { useTeamMembers, type TeamMember } from "@/hooks/use-team-data";
import { showToast } from "@/lib/toast";

/**
 * Gestão de membros dentro do LISION Vendas — RECICLA o fluxo do Lision principal
 * (mesmos endpoints /api/team/members e componentes MemberForm/PinResetPopover).
 * Só ADM (backend exige users:manage). Cobre: adicionar, editar (nome/cargo/setor),
 * resetar PIN ("senha" do operador), desativar e excluir definitivamente.
 */

const ROLE_LABELS: Record<string, string> = { ADMIN: "Admin", GERENTE: "Gerente", COORDENADOR: "Coordenador", OPERADOR: "Operador" };
const ROLE_BADGE: Record<string, "success" | "warning" | "neutral" | "destructive"> = { ADMIN: "destructive", GERENTE: "warning", COORDENADOR: "neutral", OPERADOR: "neutral" };

export function SalesMemberManagement() {
  const [search, setSearch] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [showInactive, setShowInactive] = React.useState(false);
  React.useEffect(() => { const t = setTimeout(() => setDebounced(search), 300); return () => clearTimeout(t); }, [search]);

  const { data: members, isLoading, refetch } = useTeamMembers({ search: debounced, active: !showInactive });

  const [formOpen, setFormOpen] = React.useState(false);
  const [editMember, setEditMember] = React.useState<TeamMember | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [deleteText, setDeleteText] = React.useState("");

  function openCreate() { setEditMember(null); setFormOpen(true); }
  function openEdit(m: TeamMember) { setEditMember(m); setFormOpen(true); }

  async function deactivate(m: TeamMember) {
    setBusy(m.id);
    try {
      const res = await fetch(`/api/team/members/${m.id}/deactivate`, { method: "PATCH" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Erro ao desativar");
      showToast("success", `${m.full_name} desativado`);
      refetch();
    } catch (e) { showToast("error", e instanceof Error ? e.message : "Erro ao desativar"); }
    finally { setBusy(null); }
  }

  async function remove(m: TeamMember) {
    setBusy(m.id);
    try {
      const res = await fetch(`/api/team/members/${m.id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Erro ao excluir");
      showToast("success", `${m.full_name} excluído definitivamente${body?.data?.authWarning ? " (aviso: conta de auth pode exigir limpeza manual)" : ""}`);
      setDeleteText("");
      refetch();
    } catch (e) { showToast("error", e instanceof Error ? e.message : "Erro ao excluir"); }
    finally { setBusy(null); }
  }

  const rows = members ?? [];

  return (
    <section aria-labelledby="member-mgmt" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="member-mgmt" className="text-xl font-semibold">Gestão de membros</h2>
          <p className="text-sm text-muted-foreground">Adicionar, editar, resetar PIN, desativar ou excluir membros — mesmo mecanismo do Lision. Só administradores.</p>
        </div>
        <Button onClick={openCreate} className="min-h-11 gap-2"><Plus className="size-4" /> Novo membro</Button>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap gap-3">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome..." className="input-field max-w-xs" />
            <Button variant={showInactive ? "default" : "outline"} className="min-h-11" onClick={() => setShowInactive((v) => !v)}>{showInactive ? "Mostrando inativos" : "Ativos"}</Button>
          </div>

          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Carregando membros…</p>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{showInactive ? "Nenhum membro inativo." : "Nenhum membro. Cadastre o primeiro."}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left"><th className="p-3">Nome</th><th className="p-3">Cargo</th><th className="p-3">Status</th><th className="p-3 text-right">Ações</th></tr></thead>
                <tbody>
                  {rows.map((m) => (
                    <tr key={m.id} className="border-b align-middle">
                      <td className="p-3"><div className="font-medium">{m.full_name}</div>{m.email && <div className="text-xs text-muted-foreground">{m.email}</div>}</td>
                      <td className="p-3"><StatusBadge status={ROLE_BADGE[m.role] ?? "neutral"}>{ROLE_LABELS[m.role] ?? m.role}</StatusBadge></td>
                      <td className="p-3"><StatusBadge status={m.is_active ? "success" : "destructive"}>{m.is_active ? "Ativo" : "Inativo"}</StatusBadge></td>
                      <td className="p-3">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => openEdit(m)}>Editar</Button>
                          {m.role === "OPERADOR" && m.is_active && <PinResetPopover memberId={m.id} memberName={m.full_name} />}
                          {m.is_active && <Button variant="ghost" size="sm" className="h-8 text-xs text-destructive hover:text-destructive" disabled={busy === m.id} onClick={() => void deactivate(m)}>Desativar</Button>}
                          <DeleteMemberDialog member={m} text={deleteText} setText={setDeleteText} busy={busy === m.id} remove={() => remove(m)} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <MemberForm open={formOpen} onOpenChange={setFormOpen} member={editMember} onSuccess={refetch} />
    </section>
  );
}

function DeleteMemberDialog({ member, text, setText, busy, remove }: { member: TeamMember; text: string; setText: (v: string) => void; busy: boolean; remove: () => Promise<void> }) {
  const ready = text.trim().toUpperCase() === "EXCLUIR";
  return (
    <AlertDialog onOpenChange={(open) => { if (!open) setText(""); }}>
      <AlertDialogTrigger asChild><Button variant="ghost" size="sm" className="h-8 text-xs text-destructive hover:text-destructive">Excluir</Button></AlertDialogTrigger>
      <AlertDialogContent className="sales-theme">
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir {member.full_name} definitivamente?</AlertDialogTitle>
          <AlertDialogDescription><strong>Ação irreversível</strong> — apaga a conta (auth) e o perfil. Se o membro tiver histórico vinculado, a exclusão é bloqueada e você deve desativá-lo. Para preservar tudo, use &quot;Desativar&quot;.</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1"><Label htmlFor={`del-${member.id}`}>Digite EXCLUIR para confirmar</Label><Input id={`del-${member.id}`} value={text} autoComplete="off" onChange={(e) => setText(e.target.value)} className="min-h-11" /></div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Voltar</AlertDialogCancel>
          <AlertDialogAction disabled={busy || !ready} onClick={(e) => { e.preventDefault(); void remove(); }} className="bg-destructive text-destructive-foreground">{busy ? "Excluindo..." : "Excluir definitivamente"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

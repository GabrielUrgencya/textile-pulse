"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, UserRoundCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import type { SalesAdminDirectoryEntry } from "@/lib/sales-admin";

type ApiError = { error?: { code?: string; message?: string } };

function personName(person: SalesAdminDirectoryEntry) {
  return person.fullName?.trim() || person.email || "Perfil sem nome";
}

export function SalesAdminTeam() {
  const [people, setPeople] = useState<SalesAdminDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<SalesAdminDirectoryEntry | null>(null);
  const [role, setRole] = useState<"ADMIN" | "CONSULTANT">("CONSULTANT");
  const [saving, setSaving] = useState(false);
  const [pendingDeactivate, setPendingDeactivate] = useState<SalesAdminDirectoryEntry | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);
  // D2: dados da consultora escopados ao Vendas
  const [details, setDetails] = useState<{ displayName: string; phone: string; notes: string }>({ displayName: "", phone: "", notes: "" });
  const [detailsSaving, setDetailsSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/vendas/admin/directory", { cache: "no-store" });
      const payload = (await response.json()) as { data?: SalesAdminDirectoryEntry[] } & ApiError;
      if (!response.ok || !payload.data) throw new Error(payload.error?.message || "Não foi possível carregar a equipe.");
      setPeople(payload.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar a equipe.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void load(), [load]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    if (!normalized) return people;
    return people.filter((person) =>
      [person.fullName, person.email, person.salesRole]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase("pt-BR").includes(normalized)),
    );
  }, [people, query]);

  function openEditor(person: SalesAdminDirectoryEntry) {
    setEditing(person);
    setRole(person.salesRole ?? "CONSULTANT");
    setFormError(null);
    setDetails({ displayName: "", phone: "", notes: "" });
    if (person.membershipId) {
      void (async () => {
        try {
          const response = await fetch(`/api/vendas/admin/consultant-details?profileId=${person.profileId}`, { cache: "no-store" });
          const payload = (await response.json()) as { data?: { displayName: string | null; phone: string | null; notes: string | null } } & ApiError;
          if (response.ok && payload.data) setDetails({ displayName: payload.data.displayName ?? "", phone: payload.data.phone ?? "", notes: payload.data.notes ?? "" });
        } catch { /* dados são opcionais; silenciar */ }
      })();
    }
  }
  async function saveDetails() {
    if (!editing || detailsSaving) return;
    setDetailsSaving(true);
    setFormError(null);
    try {
      const response = await fetch("/api/vendas/admin/consultant-details", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: editing.profileId, displayName: details.displayName.trim() || null, phone: details.phone.trim() || null, notes: details.notes.trim() || null }),
      });
      const payload = (await response.json()) as ApiError;
      if (!response.ok) throw new Error(payload.error?.message || "Não foi possível salvar os dados.");
      setAnnouncement(`Dados de ${personName(editing)} salvos.`);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Não foi possível salvar os dados.");
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setDetailsSaving(false);
    }
  }

  async function saveMembership(
    isActive: boolean,
    target = editing,
    requestedRole = role,
  ) {
    if (!target || saving) return;
    setSaving(true);
    setFormError(null);
    try {
      const response = await fetch("/api/vendas/admin/memberships", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: target.profileId, role: requestedRole, isActive }),
      });
      const payload = (await response.json()) as ApiError;
      if (!response.ok) throw new Error(payload.error?.message || "Não foi possível salvar o acesso.");
      await load();
      setEditing(null);
      setPendingDeactivate(null);
      setAnnouncement(`Acesso de ${personName(target)} atualizado com sucesso.`);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Não foi possível salvar o acesso.");
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setSaving(false);
    }
  }

  const columns: DataTableColumn<SalesAdminDirectoryEntry>[] = [
    {
      key: "fullName",
      header: "Pessoa",
      sortable: true,
      render: (person) => (
        <div>
          <p className="font-medium text-foreground">{personName(person)}</p>
          {person.email && <p className="text-xs text-muted-foreground">{person.email}</p>}
        </div>
      ),
    },
    {
      key: "salesRole",
      header: "Papel",
      render: (person) => person.salesRole === "ADMIN" ? "Administrador" : person.salesRole === "CONSULTANT" ? "Consultora" : "Sem acesso",
    },
    {
      key: "membershipIsActive",
      header: "Status",
      render: (person) => (
        <StatusBadge status={person.membershipIsActive ? "success" : "neutral"} size="md">
          {person.membershipIsActive ? "Ativo" : person.membershipId ? "Inativo" : "Não habilitado"}
        </StatusBadge>
      ),
    },
    {
      key: "actions",
      header: "Ações",
      className: "text-right",
      render: (person) => (
        <Button variant="outline" className="min-h-11" onClick={() => openEditor(person)}>
          {person.membershipId ? "Gerenciar acesso" : "Habilitar"}
        </Button>
      ),
    },
  ];

  return (
    <>
      <div aria-live="polite" className="sr-only">{announcement}</div>
      <PageHeader eyebrow="Administração comercial" title="Equipe" className="items-start gap-4 max-sm:flex-col" />
      <p className="mb-6 max-w-2xl text-sm text-muted-foreground">
        Habilite perfis que já pertencem a este tenant. Nenhuma conta ou senha é criada aqui.
      </p>

      <Card>
        <CardContent className="p-4 md:p-6">
          <div className="relative mb-6 max-w-md">
            <Label htmlFor="team-search" className="sr-only">Buscar na equipe</Label>
            <Search aria-hidden className="absolute left-3 top-3 size-4 text-muted-foreground" />
            <Input
              id="team-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nome, e-mail ou papel"
              className="min-h-11 pl-10"
            />
          </div>

          {error ? (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
              <p className="font-medium text-destructive">Equipe indisponível</p>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
              <Button variant="outline" className="mt-4 min-h-11" onClick={load}>Tentar novamente</Button>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={filtered}
              loading={loading}
              keyExtractor={(person) => person.profileId}
              emptyState={{
                icon: UserRoundCog,
                title: query ? "Nenhum perfil encontrado" : "Nenhum perfil disponível",
                description: query ? "Revise os termos da busca." : "Os perfis elegíveis aparecerão aqui.",
              }}
              mobileCard={(person) => (
                <Card className="shadow-none">
                  <CardContent className="space-y-4 p-4">
                    <div>
                      <p className="font-medium">{personName(person)}</p>
                      {person.email && <p className="break-all text-xs text-muted-foreground">{person.email}</p>}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span>{person.salesRole === "ADMIN" ? "Administrador" : person.salesRole === "CONSULTANT" ? "Consultora" : "Sem acesso"}</span>
                      <StatusBadge status={person.membershipIsActive ? "success" : "neutral"} size="md">
                        {person.membershipIsActive ? "Ativo" : person.membershipId ? "Inativo" : "Não habilitado"}
                      </StatusBadge>
                    </div>
                    <Button variant="outline" className="min-h-11 w-full" onClick={() => openEditor(person)}>
                      {person.membershipId ? "Gerenciar acesso" : "Habilitar"}
                    </Button>
                  </CardContent>
                </Card>
              )}
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && !saving && setEditing(null)}>
        <DialogContent className="sales-theme max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto motion-reduce:duration-0">
          <DialogHeader>
            <DialogTitle>Gerenciar acesso comercial</DialogTitle>
            <DialogDescription>
              {editing ? personName(editing) : "Perfil"}. A identidade original será preservada.
            </DialogDescription>
          </DialogHeader>
          {formError && (
            <div ref={errorRef} tabIndex={-1} role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {formError}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="sales-role">Papel no LISION Vendas</Label>
            <Select value={role} onValueChange={(value) => setRole(value as "ADMIN" | "CONSULTANT")} disabled={saving}>
              <SelectTrigger id="sales-role" className="min-h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CONSULTANT">Consultora</SelectItem>
                <SelectItem value="ADMIN">Administrador</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {editing?.membershipId && (
            <div className="space-y-3 rounded-lg border border-border/60 p-4">
              <div>
                <p className="text-sm font-medium">Dados da consultora (LISION Vendas)</p>
                <p className="text-[11px] text-muted-foreground">Nome de exibição, contato e notas — usados apenas no Vendas, sem alterar o perfil do Lision.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label htmlFor="cd-name">Nome de exibição</Label><Input id="cd-name" maxLength={120} value={details.displayName} onChange={(e) => setDetails((d) => ({ ...d, displayName: e.target.value }))} className="min-h-11" placeholder={editing ? personName(editing) : ""} /></div>
                <div className="space-y-1"><Label htmlFor="cd-phone">Telefone</Label><Input id="cd-phone" maxLength={40} value={details.phone} onChange={(e) => setDetails((d) => ({ ...d, phone: e.target.value }))} className="min-h-11" /></div>
              </div>
              <div className="space-y-1"><Label htmlFor="cd-notes">Notas</Label><Input id="cd-notes" maxLength={2000} value={details.notes} onChange={(e) => setDetails((d) => ({ ...d, notes: e.target.value }))} className="min-h-11" /></div>
              <Button variant="outline" className="min-h-11" disabled={detailsSaving} onClick={() => void saveDetails()}>{detailsSaving ? "Salvando dados..." : "Salvar dados"}</Button>
            </div>
          )}
          <DialogFooter className="gap-2">
            {editing?.membershipIsActive && (
              <Button variant="destructive" className="min-h-11" disabled={saving} onClick={() => { setPendingDeactivate(editing); setEditing(null); }}>
                Desativar acesso
              </Button>
            )}
            <Button className="min-h-11" disabled={saving} onClick={() => void saveMembership(true)}>
              {saving ? "Salvando..." : editing?.membershipIsActive ? "Salvar alterações" : "Habilitar acesso"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={pendingDeactivate !== null} onOpenChange={(open) => !open && !saving && setPendingDeactivate(null)}>
        <AlertDialogContent className="sales-theme w-[calc(100%-2rem)] motion-reduce:duration-0">
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar acesso de {pendingDeactivate ? personName(pendingDeactivate) : "esta pessoa"}?</AlertDialogTitle>
            <AlertDialogDescription>
              O perfil e o histórico serão preservados. Se este for o último administrador ativo, a operação será bloqueada com uma orientação clara.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {formError && <div ref={errorRef} tabIndex={-1} role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{formError}</div>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={saving} onClick={(event) => { event.preventDefault(); void saveMembership(false, pendingDeactivate, pendingDeactivate?.salesRole ?? role); }}>
              {saving ? "Desativando..." : "Confirmar desativação"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

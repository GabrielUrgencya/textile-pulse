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
  // 11.1: criação de consultora (VENDEDOR) e adição de admin por busca
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<{ name: string; email: string; password: string }>({ name: "", email: "", password: "" });
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdPin, setCreatedPin] = useState<string | null>(null);
  const [adminSearch, setAdminSearch] = useState(false);
  const [adminQuery, setAdminQuery] = useState("");
  const [adminResults, setAdminResults] = useState<SalesAdminDirectoryEntry[]>([]);
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

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

  async function createConsultant() {
    if (createBusy) return;
    if (!createForm.name.trim()) { setCreateError("Informe o nome da consultora."); return; }
    setCreateBusy(true); setCreateError(null); setCreatedPin(null);
    try {
      const response = await fetch("/api/team/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createForm.name.trim(),
          email: createForm.email.trim() || undefined,
          password: createForm.password.trim() || undefined,
          role: "VENDEDOR",
          sector: "VENDAS",
        }),
      });
      const payload = (await response.json()) as { data?: { pin?: string; salesLinkWarning?: string } } & ApiError;
      if (!response.ok || !payload.data) throw new Error(payload.error?.message || "Não foi possível criar a consultora.");
      setCreatedPin(payload.data.pin ?? null);
      setAnnouncement(`Consultora ${createForm.name.trim()} criada.`);
      await load();
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : "Não foi possível criar a consultora.");
    } finally {
      setCreateBusy(false);
    }
  }

  async function runAdminSearch(term: string) {
    setAdminQuery(term);
    if (term.trim().length < 2) { setAdminResults([]); return; }
    setAdminBusy(true); setAdminError(null);
    try {
      const response = await fetch(`/api/vendas/admin/profile-search?q=${encodeURIComponent(term.trim())}`, { cache: "no-store" });
      const payload = (await response.json()) as { data?: SalesAdminDirectoryEntry[] } & ApiError;
      if (!response.ok || !payload.data) throw new Error(payload.error?.message || "Falha na busca.");
      setAdminResults(payload.data);
    } catch (cause) {
      setAdminError(cause instanceof Error ? cause.message : "Falha na busca.");
    } finally {
      setAdminBusy(false);
    }
  }

  async function promoteAdmin(person: SalesAdminDirectoryEntry) {
    if (adminBusy) return;
    setAdminBusy(true); setAdminError(null);
    try {
      const response = await fetch("/api/vendas/admin/memberships", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: person.profileId, role: "ADMIN", isActive: true }),
      });
      const payload = (await response.json()) as ApiError;
      if (!response.ok) throw new Error(payload.error?.message || "Não foi possível promover a administrador.");
      setAnnouncement(`${personName(person)} agora é administrador do Vendas.`);
      setAdminSearch(false); setAdminQuery(""); setAdminResults([]);
      await load();
    } catch (cause) {
      setAdminError(cause instanceof Error ? cause.message : "Não foi possível promover a administrador.");
    } finally {
      setAdminBusy(false);
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
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <PageHeader eyebrow="Administração comercial" title="Equipe" className="items-start gap-4 max-sm:flex-col" />
        <div className="flex flex-wrap gap-2">
          <Button className="min-h-11" onClick={() => { setCreateForm({ name: "", email: "", password: "" }); setCreateError(null); setCreatedPin(null); setCreating(true); }}>Nova consultora</Button>
          <Button variant="outline" className="min-h-11" onClick={() => { setAdminQuery(""); setAdminResults([]); setAdminError(null); setAdminSearch(true); }}>Adicionar administrador</Button>
        </div>
      </div>
      <p className="mb-6 mt-2 max-w-2xl text-sm text-muted-foreground">
        A equipe do Vendas é isolada da produção: aqui aparecem só consultoras e administradores do Vendas. Use &quot;Nova consultora&quot; para criar um acesso exclusivo de vendas.
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

      <Dialog open={creating} onOpenChange={(open) => !open && !createBusy && setCreating(false)}>
        <DialogContent className="sales-theme max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto motion-reduce:duration-0">
          <DialogHeader>
            <DialogTitle>Nova consultora</DialogTitle>
            <DialogDescription>Cria um acesso exclusivo de Vendas (cargo Vendedor). A pessoa não vê nenhuma área de produção.</DialogDescription>
          </DialogHeader>
          {createError && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{createError}</div>}
          {createdPin ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-border/60 bg-secondary/30 p-4">
                <p className="text-sm">Consultora criada. PIN de acesso:</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums tracking-widest">{createdPin}</p>
                <p className="mt-1 text-xs text-muted-foreground">Anote e entregue à consultora. Ela também pode entrar por e-mail/senha, se informados.</p>
              </div>
              <DialogFooter>
                <Button className="min-h-11" onClick={() => setCreating(false)}>Concluir</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1"><Label htmlFor="nc-name">Nome</Label><Input id="nc-name" className="min-h-11" value={createForm.name} onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))} placeholder="Nome da consultora" /></div>
              <div className="space-y-1"><Label htmlFor="nc-email">E-mail (opcional)</Label><Input id="nc-email" type="email" className="min-h-11" value={createForm.email} onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))} placeholder="para login por e-mail" /></div>
              <div className="space-y-1"><Label htmlFor="nc-pass">Senha (opcional)</Label><Input id="nc-pass" type="text" className="min-h-11" value={createForm.password} onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))} placeholder="deixe em branco para acesso só por PIN" /></div>
              <DialogFooter className="gap-2">
                <Button variant="outline" className="min-h-11" disabled={createBusy} onClick={() => setCreating(false)}>Cancelar</Button>
                <Button className="min-h-11" disabled={createBusy} onClick={() => void createConsultant()}>{createBusy ? "Criando..." : "Criar consultora"}</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={adminSearch} onOpenChange={(open) => !open && !adminBusy && setAdminSearch(false)}>
        <DialogContent className="sales-theme max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto motion-reduce:duration-0">
          <DialogHeader>
            <DialogTitle>Adicionar administrador</DialogTitle>
            <DialogDescription>Busque um perfil do tenant para promover a administrador do Vendas. Esta é a única porta que consulta perfis de produção.</DialogDescription>
          </DialogHeader>
          {adminError && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{adminError}</div>}
          <div className="relative">
            <Search aria-hidden className="absolute left-3 top-3 size-4 text-muted-foreground" />
            <Input className="min-h-11 pl-10" value={adminQuery} onChange={(e) => void runAdminSearch(e.target.value)} placeholder="Buscar por nome ou e-mail (mín. 2 letras)" />
          </div>
          <div className="space-y-2">
            {adminBusy && <p className="text-sm text-muted-foreground">Buscando...</p>}
            {!adminBusy && adminQuery.trim().length >= 2 && adminResults.length === 0 && <p className="text-sm text-muted-foreground">Nenhum perfil encontrado.</p>}
            {adminResults.map((person) => (
              <div key={person.profileId} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{personName(person)}</p>
                  {person.email && <p className="truncate text-xs text-muted-foreground">{person.email}</p>}
                </div>
                {person.salesRole === "ADMIN" && person.membershipIsActive ? (
                  <StatusBadge status="success" size="md">Já é admin</StatusBadge>
                ) : (
                  <Button variant="outline" className="min-h-11 shrink-0" disabled={adminBusy} onClick={() => void promoteAdmin(person)}>Promover a admin</Button>
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" className="min-h-11" disabled={adminBusy} onClick={() => setAdminSearch(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

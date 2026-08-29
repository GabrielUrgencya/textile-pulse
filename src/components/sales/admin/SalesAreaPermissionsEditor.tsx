"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { StatusBadge } from "@/components/ui/status-badge";
import { salesAdminConfigurationRequest } from "./SalesAdminConfiguration";
import { SALES_ADMIN_AREAS, SALES_AREA_TITLES } from "@/lib/sales-areas";

type MatrixUser = { profileId: string; fullName: string | null; email: string | null; salesRole: "ADMIN" | "CONSULTANT"; overrides: Record<string, boolean> };
type Matrix = { areas: string[]; roleOverrides: Record<string, Record<string, boolean>>; users: MatrixUser[] };

const AREAS = SALES_ADMIN_AREAS.map((a) => a.area);

export function SalesAreaPermissionsEditor() {
  const [roleAdmin, setRoleAdmin] = useState<Record<string, boolean>>({});
  const [userOv, setUserOv] = useState<Record<string, Record<string, boolean>>>({});
  const [users, setUsers] = useState<MatrixUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const m = await salesAdminConfigurationRequest<Matrix>("/api/vendas/admin/area-permissions");
      const admin: Record<string, boolean> = {};
      for (const a of AREAS) admin[a] = m.roleOverrides?.ADMIN?.[a] ?? true;
      setRoleAdmin(admin);
      const ov: Record<string, Record<string, boolean>> = {};
      for (const u of m.users ?? []) if (u.overrides && Object.keys(u.overrides).length) ov[u.profileId] = { ...u.overrides };
      setUserOv(ov);
      setUsers(m.users ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Permissões indisponíveis.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => void load(), [load]);

  const adminUsers = useMemo(() => users.filter((u) => u.salesRole === "ADMIN"), [users]);

  async function save() {
    setSaving(true); setError(null);
    try {
      await salesAdminConfigurationRequest("/api/vendas/admin/area-permissions", {
        method: "PUT",
        body: JSON.stringify({ roleOverrides: { ADMIN: roleAdmin }, userOverrides: userOv }),
      });
      setAnnounce("Permissões salvas.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao salvar permissões.");
    } finally {
      setSaving(false);
    }
  }

  function setUserArea(profileId: string, area: string, value: "" | "true" | "false") {
    setUserOv((prev) => {
      const next = { ...prev };
      const cur = { ...(next[profileId] ?? {}) };
      if (value === "") delete cur[area]; else cur[area] = value === "true";
      if (Object.keys(cur).length) next[profileId] = cur; else delete next[profileId];
      return next;
    });
  }

  if (loading) return <Card><CardContent className="p-5 text-sm text-muted-foreground">Carregando permissões...</CardContent></Card>;

  const selected = adminUsers.find((u) => u.profileId === selectedUser) ?? null;

  return (
    <Card>
      <CardContent className="space-y-6 p-5">
        <div aria-live="polite" className="sr-only">{announce}</div>
        <div>
          <h3 className="text-lg font-semibold">Permissões de acesso</h3>
          <p className="text-sm text-muted-foreground">Controle quais áreas do Vendas cada cargo e cada administrador enxerga. O ajuste por usuário prevalece sobre o do cargo.</p>
        </div>
        {error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

        <section className="space-y-3">
          <h4 className="text-sm font-medium uppercase tracking-[0.12em] text-muted-foreground">Por cargo — Administrador</h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {AREAS.map((area) => (
              <label key={area} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2">
                <span className="text-sm">{SALES_AREA_TITLES[area]}</span>
                <Switch checked={roleAdmin[area] ?? true} onCheckedChange={(v) => setRoleAdmin((p) => ({ ...p, [area]: v }))} disabled={area === "config"} />
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Configurações permanece sempre acessível ao cargo Administrador (anti-lockout).</p>
        </section>

        <section className="space-y-3">
          <h4 className="text-sm font-medium uppercase tracking-[0.12em] text-muted-foreground">Por usuário (administradores)</h4>
          <div className="space-y-1">
            <Label htmlFor="perm-user">Administrador</Label>
            <select id="perm-user" className="min-h-11 w-full rounded-md border bg-background px-3" value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)}>
              <option value="">Selecione um administrador para ajustar</option>
              {adminUsers.map((u) => <option key={u.profileId} value={u.profileId}>{u.fullName ?? u.email}</option>)}
            </select>
          </div>
          {selected && (
            <div className="space-y-2 rounded-lg border border-border/60 p-3">
              {AREAS.map((area) => {
                const val = userOv[selected.profileId]?.[area];
                const state = val === undefined ? "" : val ? "true" : "false";
                return (
                  <div key={area} className="flex items-center justify-between gap-3">
                    <span className="text-sm">{SALES_AREA_TITLES[area]}</span>
                    <select className="h-10 rounded-md border bg-background px-2 text-sm" value={state} onChange={(e) => setUserArea(selected.profileId, area, e.target.value as "" | "true" | "false")}>
                      <option value="">Herda do cargo</option>
                      <option value="true">Liberado</option>
                      <option value="false">Bloqueado</option>
                    </select>
                  </div>
                );
              })}
              {Object.keys(userOv[selected.profileId] ?? {}).length > 0 && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <StatusBadge status="warning" size="sm">{Object.keys(userOv[selected.profileId]).length} ajuste(s)</StatusBadge>
                  <Button variant="ghost" size="sm" onClick={() => setUserOv((p) => { const n = { ...p }; delete n[selected.profileId]; return n; })}>Limpar ajustes deste usuário</Button>
                </div>
              )}
            </div>
          )}
        </section>

        <Button className="min-h-11" disabled={saving} onClick={() => void save()}>{saving ? "Salvando..." : "Salvar permissões"}</Button>
      </CardContent>
    </Card>
  );
}

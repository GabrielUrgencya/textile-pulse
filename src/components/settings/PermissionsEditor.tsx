"use client";

import * as React from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { showToast } from "@/lib/toast";

type Permission = string;
type Role = string;

interface PermissionsData {
  matrix: Record<Role, Permission[]>;
  allPermissions: Permission[];
  lockedPermissions: Permission[];
}

const PERMISSION_GROUPS: Record<string, { label: string; permissions: string[] }> = {
  dashboard: {
    label: "Dashboard",
    permissions: ["dashboard:view"],
  },
  orders: {
    label: "Produção",
    permissions: ["orders:view", "orders:create", "orders:edit", "orders:delete"],
  },
  scan: {
    label: "Scan / Bipagem",
    permissions: ["scan:view", "scan:execute"],
  },
  labels: {
    label: "Etiquetas",
    permissions: ["labels:print"],
  },
  rework: {
    label: "Retrabalho",
    permissions: ["rework:view", "rework:report", "rework:resolve"],
  },
  quality: {
    label: "Qualidade",
    permissions: ["quality:view", "quality:manage"],
  },
  factions: {
    label: "Facções / Expedição",
    permissions: ["factions:view", "factions:manage"],
  },
  reports: {
    label: "Relatórios",
    permissions: ["reports:export"],
  },
  admin: {
    label: "Administração",
    permissions: ["users:manage", "settings:manage"],
  },
};

const PERMISSION_LABELS: Record<string, string> = {
  "dashboard:view": "Ver dashboard",
  "orders:view": "Ver ordens",
  "orders:create": "Criar ordens",
  "orders:edit": "Editar ordens",
  "orders:delete": "Cancelar ordens",
  "scan:view": "Ver scan",
  "scan:execute": "Executar bipagem",
  "labels:print": "Imprimir etiquetas",
  "rework:view": "Ver retrabalhos",
  "rework:report": "Reportar defeito",
  "rework:resolve": "Resolver retrabalho",
  "quality:view": "Ver qualidade",
  "quality:manage": "Gerir qualidade",
  "factions:view": "Ver facções",
  "factions:manage": "Gerir facções",
  "reports:export": "Exportar relatórios",
  "users:manage": "Gerir equipe",
  "settings:manage": "Gerir configurações",
};

const EDITABLE_ROLES: Role[] = ["GERENTE", "COORDENADOR", "OPERADOR"];

export function PermissionsEditor() {
  const [data, setData] = React.useState<PermissionsData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  // local toggle state: role -> permission -> boolean
  const [toggles, setToggles] = React.useState<Record<Role, Record<Permission, boolean>>>({});

  React.useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/permissions");
      if (!res.ok) throw new Error();
      const json: PermissionsData = await res.json();
      setData(json);

      // Initialize toggles from matrix
      const t: Record<Role, Record<Permission, boolean>> = {};
      for (const role of EDITABLE_ROLES) {
        t[role] = {};
        const perms = json.matrix[role] ?? [];
        for (const p of json.allPermissions) {
          t[role][p] = perms.includes(p);
        }
      }
      setToggles(t);
      setDirty(false);
    } catch {
      showToast("error", "Erro ao carregar permissões");
    } finally {
      setLoading(false);
    }
  }

  function handleToggle(role: Role, permission: Permission) {
    setToggles((prev) => ({
      ...prev,
      [role]: { ...prev[role], [permission]: !prev[role]?.[permission] },
    }));
    setDirty(true);
  }

  async function handleSave() {
    if (!data) return;
    setSaving(true);
    try {
      // Build overrides: only include permissions that differ from defaults
      const overrides: Record<Role, Record<Permission, boolean>> = {};
      for (const role of EDITABLE_ROLES) {
        overrides[role] = {};
        for (const perm of data.allPermissions) {
          const isOn = toggles[role]?.[perm] ?? false;
          overrides[role][perm] = isOn;
        }
      }

      const res = await fetch("/api/settings/permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides }),
      });

      if (!res.ok) {
        const err = await res.json();
        showToast("error", err.error || "Erro ao salvar");
        return;
      }

      const updated: PermissionsData = await res.json();
      setData(updated);

      // Refresh toggles from response
      const t: Record<Role, Record<Permission, boolean>> = {};
      for (const role of EDITABLE_ROLES) {
        t[role] = {};
        const perms = updated.matrix[role] ?? [];
        for (const p of updated.allPermissions) {
          t[role][p] = perms.includes(p);
        }
      }
      setToggles(t);
      setDirty(false);
      showToast("success", "Permissões salvas");
    } catch {
      showToast("error", "Erro ao salvar permissões");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Permissões por Cargo</h2>
          <p className="text-sm text-muted-foreground">
            Defina o que cada cargo pode ver e fazer na plataforma.
            ADMIN tem acesso total e não pode ser editado.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={fetchData}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-border/60 text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition"
          >
            <RotateCcw className="size-3.5" />
            Resetar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-foreground text-background font-medium hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            Salvar Permissões
          </button>
        </div>
      </div>

      {/* Matrix table */}
      <div className="border border-border/60 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-secondary/30 border-b border-border/60">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground w-[240px]">
                  Permissão
                </th>
                {EDITABLE_ROLES.map((role) => (
                  <th
                    key={role}
                    className="text-center px-4 py-3 font-medium text-muted-foreground w-[120px]"
                  >
                    {role}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(PERMISSION_GROUPS).map(([groupId, group]) => (
                <React.Fragment key={groupId}>
                  {/* Group header */}
                  <tr className="bg-secondary/10">
                    <td
                      colSpan={EDITABLE_ROLES.length + 1}
                      className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      {group.label}
                    </td>
                  </tr>
                  {/* Permission rows */}
                  {group.permissions
                    .filter((p) => data.allPermissions.includes(p))
                    .map((perm) => (
                      <tr
                        key={perm}
                        className="border-b border-border/20 hover:bg-secondary/10 transition-colors"
                      >
                        <td className="px-4 py-2.5 text-[13px]">
                          {PERMISSION_LABELS[perm] ?? perm}
                          <span className="ml-2 text-[10px] text-muted-foreground/60 font-mono">
                            {perm}
                          </span>
                        </td>
                        {EDITABLE_ROLES.map((role) => {
                          const isLocked =
                            role === "ADMIN" &&
                            data.lockedPermissions.includes(perm);
                          const isOn = toggles[role]?.[perm] ?? false;
                          return (
                            <td key={role} className="text-center px-4 py-2.5">
                              <button
                                type="button"
                                onClick={() => handleToggle(role, perm)}
                                disabled={isLocked}
                                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                                  isOn
                                    ? "bg-foreground"
                                    : "bg-border"
                                } ${isLocked ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
                              >
                                <span
                                  className={`inline-block size-3.5 rounded-full bg-background transition-transform ${
                                    isOn ? "translate-x-[18px]" : "translate-x-[3px]"
                                  }`}
                                />
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

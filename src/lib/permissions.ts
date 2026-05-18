/**
 * Role-based permission helper for LISION
 *
 * 3 perfis operacionais:
 *   admin    — acesso total
 *   gerente  — leitura + criação de OP
 *   operador — apenas bipagem + visualização
 */

export type AppRole = "ADMIN" | "GERENTE" | "COORDENADOR" | "OPERADOR";

type Permission =
  | "dashboard:view"
  | "orders:view"
  | "orders:create"
  | "orders:edit"
  | "orders:delete"
  | "scan:view"
  | "scan:execute"
  | "labels:print"
  | "rework:report"
  | "rework:resolve"
  | "rework:view"
  | "users:manage"
  | "settings:manage";

const ROLE_PERMISSIONS: Record<AppRole, readonly Permission[]> = {
  ADMIN: [
    "dashboard:view",
    "orders:view",
    "orders:create",
    "orders:edit",
    "orders:delete",
    "scan:view",
    "scan:execute",
    "labels:print",
    "rework:report",
    "rework:resolve",
    "rework:view",
    "users:manage",
    "settings:manage",
  ],
  GERENTE: [
    "dashboard:view",
    "orders:view",
    "orders:create",
    "orders:edit",
    "scan:view",
    "scan:execute",
    "labels:print",
    "rework:report",
    "rework:resolve",
    "rework:view",
  ],
  COORDENADOR: [
    "dashboard:view",
    "orders:view",
    "orders:create",
    "scan:view",
    "scan:execute",
    "labels:print",
    "rework:report",
    "rework:resolve",
    "rework:view",
  ],
  OPERADOR: [
    "scan:view",
    "scan:execute",
    "rework:report",
    "rework:view",
  ],
} as const;

/** Check if a role has a specific permission */
export function hasPermission(role: AppRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Check if a role has ALL of the given permissions */
export function hasAllPermissions(
  role: AppRole,
  permissions: Permission[]
): boolean {
  return permissions.every((p) => hasPermission(role, p));
}

/** Check if a role has ANY of the given permissions */
export function hasAnyPermission(
  role: AppRole,
  permissions: Permission[]
): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

/** Get all permissions for a role */
export function getPermissions(role: AppRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/** Minimum role hierarchy: ADMIN > GERENTE > COORDENADOR > OPERADOR */
const ROLE_LEVEL: Record<AppRole, number> = {
  ADMIN: 40,
  GERENTE: 30,
  COORDENADOR: 20,
  OPERADOR: 10,
};

/** Check if role meets minimum required level */
export function hasMinRole(role: AppRole, minRole: AppRole): boolean {
  return (ROLE_LEVEL[role] ?? 0) >= (ROLE_LEVEL[minRole] ?? 0);
}

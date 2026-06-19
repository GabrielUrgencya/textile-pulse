import type { SupabaseClient, User } from "@supabase/supabase-js";
import { ROLE_PERMISSIONS, type AppRole } from "./permissions";

/**
 * Story 8.22 — Motor de permissão dinâmico (RBAC).
 *
 * Efetivo = defaults do código (ROLE_PERMISSIONS) ⊕ overrides do banco
 * (role_permissions: allowed=true adiciona / false remove).
 *
 * Cache em memória por tenant (TTL curto), invalidado ao salvar.
 * `can(user, perm)` é SÍNCRONO: lê do WeakMap populado por withAuth().
 */

interface CacheEntry {
  sets: Record<string, Set<string>>;
  expires: number;
}

const TTL_MS = 30_000;
const tenantCache = new Map<string, CacheEntry>();
const userPerms = new WeakMap<User, Set<string>>();

async function loadTenantSets(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<Record<string, Set<string>>> {
  const now = Date.now();
  const cached = tenantCache.get(tenantId);
  if (cached && cached.expires > now) return cached.sets;

  // 1) Defaults do código
  const sets: Record<string, Set<string>> = {};
  for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
    sets[role] = new Set(perms as readonly string[]);
  }

  // 2) Overrides do banco (RLS já restringe ao tenant)
  const { data } = await supabase
    .from("role_permissions")
    .select("role, permission, allowed")
    .eq("tenant_id", tenantId);

  for (const row of data || []) {
    const role = row.role as string;
    if (!sets[role]) sets[role] = new Set();
    if (row.allowed) sets[role].add(row.permission as string);
    else sets[role].delete(row.permission as string);
  }

  tenantCache.set(tenantId, { sets, expires: now + TTL_MS });
  return sets;
}

/** Carrega as permissões efetivas do usuário e guarda no WeakMap (chamado por withAuth). */
export async function loadUserPermissions(
  supabase: SupabaseClient,
  user: User,
): Promise<Set<string>> {
  const tenantId = user.app_metadata?.tenant_id as string | undefined;
  const role = user.app_metadata?.role as string | undefined;
  if (!tenantId || !role) {
    const empty = new Set<string>();
    userPerms.set(user, empty);
    return empty;
  }
  const sets = await loadTenantSets(supabase, tenantId);
  const set = sets[role] ?? new Set<string>();
  userPerms.set(user, set);
  return set;
}

/** Checagem síncrona — usa o WeakMap; fallback para os defaults se não carregado. */
export function can(user: User, permission: string): boolean {
  const set = userPerms.get(user);
  if (set) return set.has(permission);
  const role = user.app_metadata?.role as AppRole | undefined;
  const defaults = role ? (ROLE_PERMISSIONS[role] as readonly string[] | undefined) : undefined;
  return defaults?.includes(permission) ?? false;
}

/** Lista as permissões efetivas do usuário (para o frontend). */
export function getUserPermissions(user: User): string[] {
  const set = userPerms.get(user);
  if (set) return Array.from(set);
  const role = user.app_metadata?.role as AppRole | undefined;
  return role ? [...(ROLE_PERMISSIONS[role] ?? [])] : [];
}

/** Invalida o cache de um tenant (chamar ao salvar overrides). */
export function invalidateTenantPermissions(tenantId: string): void {
  tenantCache.delete(tenantId);
}

/** Matriz efetiva por cargo (para o editor admin). */
export async function getEffectiveMatrix(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<Record<string, string[]>> {
  const sets = await loadTenantSets(supabase, tenantId);
  const out: Record<string, string[]> = {};
  for (const [role, set] of Object.entries(sets)) out[role] = Array.from(set);
  return out;
}

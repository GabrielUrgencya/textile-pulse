import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";
import {
  getEffectiveMatrix,
  invalidateTenantPermissions,
} from "@/lib/effective-permissions";
import {
  ALL_PERMISSIONS,
  ADMIN_LOCKED_PERMISSIONS,
} from "@/lib/permissions";

/**
 * Story 8.22 — GET: retorna a matriz efetiva (cargo × permissão) para o editor admin.
 */
export async function GET() {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  if (!can(user, "settings:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenantId = user.app_metadata?.tenant_id as string;
  const matrix = await getEffectiveMatrix(supabase, tenantId);

  return NextResponse.json({
    matrix,
    allPermissions: ALL_PERMISSIONS,
    lockedPermissions: ADMIN_LOCKED_PERMISSIONS,
  });
}

/**
 * Story 8.22 — PUT: grava overrides de permissão por cargo.
 * Body: { overrides: { GERENTE: { "orders:delete": false, ... }, ... } }
 */
export async function PUT(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  if (!can(user, "settings:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenantId = user.app_metadata?.tenant_id as string;
  const body = await request.json();
  const overrides: Record<string, Record<string, boolean>> =
    body.overrides ?? {};

  // Anti-lockout: ADMIN never loses critical permissions
  for (const perm of ADMIN_LOCKED_PERMISSIONS) {
    if (overrides.ADMIN && overrides.ADMIN[perm] === false) {
      return NextResponse.json(
        {
          error: `Cannot remove '${perm}' from ADMIN (anti-lockout)`,
        },
        { status: 400 },
      );
    }
  }

  // Build upsert rows
  const rows: {
    tenant_id: string;
    role: string;
    permission: string;
    allowed: boolean;
  }[] = [];

  for (const [role, perms] of Object.entries(overrides)) {
    if (role === "ADMIN") continue; // ADMIN keeps all defaults — no overrides needed
    for (const [perm, allowed] of Object.entries(perms)) {
      if (!ALL_PERMISSIONS.includes(perm as (typeof ALL_PERMISSIONS)[number]))
        continue;
      rows.push({ tenant_id: tenantId, role, permission: perm, allowed });
    }
  }

  // Clear existing overrides for this tenant, then insert new ones
  const { error: delError } = await supabase
    .from("role_permissions")
    .delete()
    .eq("tenant_id", tenantId);

  if (delError) {
    return NextResponse.json(
      { error: "Failed to clear overrides" },
      { status: 500 },
    );
  }

  if (rows.length > 0) {
    const { error: insError } = await supabase
      .from("role_permissions")
      .insert(rows);

    if (insError) {
      return NextResponse.json(
        { error: "Failed to save overrides" },
        { status: 500 },
      );
    }
  }

  // Invalidate cache so next request picks up new permissions
  invalidateTenantPermissions(tenantId);

  // Return updated matrix
  const matrix = await getEffectiveMatrix(supabase, tenantId);

  return NextResponse.json({
    matrix,
    allPermissions: ALL_PERMISSIONS,
    lockedPermissions: ADMIN_LOCKED_PERMISSIONS,
  });
}

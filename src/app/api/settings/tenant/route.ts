import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { hasPermission, type AppRole } from "@/lib/permissions";
import { dbError, requireTenantId } from "@/lib/api-helpers";

export async function GET() {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;
  const t = requireTenantId(user);
  if (t.error) return t.error;

  const { data: tenant, error } = await supabase
    .from("tenants")
    .select("id, name, settings")
    .eq("id", t.tenantId)
    .single();

  if (error || !tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  return NextResponse.json({ data: tenant });
}

export async function PATCH(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;
  const role = user.app_metadata?.role;

  if (!hasPermission(role as AppRole, "settings:manage")) {
    return NextResponse.json({ error: "Forbidden: settings:manage required" }, { status: 403 });
  }

  const t = requireTenantId(user);
  if (t.error) return t.error;
  const body = await request.json().catch(() => null);

  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.name) updates.name = body.name;

  // Merge timezone into settings JSONB
  if (body.timezone) {
    const { data: current } = await supabase
      .from("tenants")
      .select("settings")
      .eq("id", t.tenantId)
      .single();

    updates.settings = { ...(current?.settings as object || {}), timezone: body.timezone };
  }

  const { error } = await supabase
    .from("tenants")
    .update(updates)
    .eq("id", t.tenantId);

  if (error) return dbError("PATCH /api/settings/tenant", error);

  return NextResponse.json({ data: { success: true } });
}

export { PATCH as PUT };

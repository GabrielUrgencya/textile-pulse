import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";
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

  if (!can(user, "settings:manage")) {
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

  // Merge em settings JSONB (timezone, work_days, holidays) — sem sobrescrever o resto.
  const settingsPatch: Record<string, unknown> = {};
  if (body.timezone) settingsPatch.timezone = body.timezone;
  if (Array.isArray(body.work_days)) {
    const wd = body.work_days as unknown[];
    const valid = wd.length > 0 && wd.every((d) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6);
    if (!valid) {
      return NextResponse.json({ error: "work_days deve ser um array não-vazio de inteiros 0..6" }, { status: 400 });
    }
    settingsPatch.work_days = Array.from(new Set(wd as number[])).sort((a, b) => a - b);
  }
  if (Array.isArray(body.holidays)) {
    settingsPatch.holidays = (body.holidays as unknown[]).filter(
      (h): h is string => typeof h === "string" && /^\d{4}-\d{2}-\d{2}$/.test(h),
    );
  }
  if (Object.keys(settingsPatch).length > 0) {
    const { data: current } = await supabase
      .from("tenants")
      .select("settings")
      .eq("id", t.tenantId)
      .single();
    updates.settings = { ...((current?.settings as object) || {}), ...settingsPatch };
  }

  const { error } = await supabase
    .from("tenants")
    .update(updates)
    .eq("id", t.tenantId);

  if (error) return dbError("PATCH /api/settings/tenant", error);

  return NextResponse.json({ data: { success: true } });
}

export { PATCH as PUT };

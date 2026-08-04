import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";
import { dbError, requireTenantId } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";

interface TenantTargets {
  dailyPiecesTarget: number;
  weeklyPointsTarget: number;
  monthlyPointsTarget: number;
  productivityTarget: number;
  defectTolerance: number;
  lotsTarget: number;
  opsTarget: number;
  shiftStart: string;
  shiftEnd: string;
  // Frente 3 — jornada / meta por hora (compartilhada por tenant)
  hourlyMetaEnabled: boolean;
  lunchStart: string;
  lunchEnd: string;
}

const DEFAULTS: TenantTargets = {
  dailyPiecesTarget: 1000,
  // Story 8.30: metas semanal/mensal INDEPENDENTES (não múltiplos da diária)
  weeklyPointsTarget: 5000,
  monthlyPointsTarget: 20000,
  productivityTarget: 85,
  defectTolerance: 3,
  lotsTarget: 100,
  opsTarget: 15,
  shiftStart: "07:00",
  shiftEnd: "17:00",
  hourlyMetaEnabled: false,
  lunchStart: "",
  lunchEnd: "",
};

export async function GET() {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { user } = auth;
  const t = requireTenantId(user);
  if (t.error) return t.error;

  const { data: tenant, error } = await supabaseAdmin
    .from("tenants")
    .select("settings")
    .eq("id", t.tenantId)
    .maybeSingle();

  if (error) return dbError("GET /api/settings/targets", error);
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  const settings = (tenant?.settings as Record<string, unknown>) || {};

  const targets: TenantTargets = {
    dailyPiecesTarget: (settings.dailyPiecesTarget as number) ?? DEFAULTS.dailyPiecesTarget,
    weeklyPointsTarget: (settings.weeklyPointsTarget as number) ?? DEFAULTS.weeklyPointsTarget,
    monthlyPointsTarget: (settings.monthlyPointsTarget as number) ?? DEFAULTS.monthlyPointsTarget,
    productivityTarget: (settings.productivityTarget as number) ?? DEFAULTS.productivityTarget,
    defectTolerance: (settings.defectTolerance as number) ?? DEFAULTS.defectTolerance,
    lotsTarget: (settings.lotsTarget as number) ?? DEFAULTS.lotsTarget,
    opsTarget: (settings.opsTarget as number) ?? DEFAULTS.opsTarget,
    shiftStart: (settings.shiftStart as string) ?? DEFAULTS.shiftStart,
    shiftEnd: (settings.shiftEnd as string) ?? DEFAULTS.shiftEnd,
    hourlyMetaEnabled: (settings.hourlyMetaEnabled as boolean) ?? DEFAULTS.hourlyMetaEnabled,
    lunchStart: (settings.lunchStart as string) ?? DEFAULTS.lunchStart,
    lunchEnd: (settings.lunchEnd as string) ?? DEFAULTS.lunchEnd,
  };

  return NextResponse.json(
    { data: targets },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { user } = auth;

  if (!can(user, "settings:manage")) {
    return NextResponse.json({ error: "Forbidden: settings:manage required" }, { status: 403 });
  }

  const t = requireTenantId(user);
  if (t.error) return t.error;

  const body = await request.json().catch(() => null);

  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Get current settings to merge
  const { data: tenant, error: readError } = await supabaseAdmin
    .from("tenants")
    .select("settings")
    .eq("id", t.tenantId)
    .maybeSingle();

  if (readError) return dbError("PATCH /api/settings/targets/read", readError);
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  const currentSettings = (tenant?.settings as Record<string, unknown>) || {};

  const updatedSettings = {
    ...currentSettings,
    ...(body.dailyPiecesTarget !== undefined && { dailyPiecesTarget: Number(body.dailyPiecesTarget) }),
    ...(body.weeklyPointsTarget !== undefined && { weeklyPointsTarget: Number(body.weeklyPointsTarget) }),
    ...(body.monthlyPointsTarget !== undefined && { monthlyPointsTarget: Number(body.monthlyPointsTarget) }),
    ...(body.productivityTarget !== undefined && { productivityTarget: Number(body.productivityTarget) }),
    ...(body.defectTolerance !== undefined && { defectTolerance: Number(body.defectTolerance) }),
    ...(body.lotsTarget !== undefined && { lotsTarget: Number(body.lotsTarget) }),
    ...(body.opsTarget !== undefined && { opsTarget: Number(body.opsTarget) }),
    ...(body.shiftStart !== undefined && { shiftStart: body.shiftStart }),
    ...(body.shiftEnd !== undefined && { shiftEnd: body.shiftEnd }),
    ...(body.hourlyMetaEnabled !== undefined && { hourlyMetaEnabled: Boolean(body.hourlyMetaEnabled) }),
    ...(body.lunchStart !== undefined && { lunchStart: body.lunchStart }),
    ...(body.lunchEnd !== undefined && { lunchEnd: body.lunchEnd }),
  };

  // `tenants` is RLS-protected. A blocked UPDATE can resolve without an error
  // and affect zero rows, which previously produced a false success toast.
  // Authorization is enforced above; the server-side client then writes only
  // the authenticated user's tenant and verifies the returned row.
  const { data: savedTenant, error } = await supabaseAdmin
    .from("tenants")
    .update({ settings: updatedSettings })
    .eq("id", t.tenantId)
    .select("id, settings")
    .maybeSingle();

  if (error) return dbError("PATCH /api/settings/targets", error);
  if (!savedTenant) {
    return NextResponse.json({ error: "Não foi possível confirmar o salvamento das metas" }, { status: 409 });
  }

  // Read the record again instead of trusting the mutation echo. This catches
  // database-side rewrites or stale write responses before the UI reports a
  // successful save.
  const { data: confirmedTenant, error: confirmError } = await supabaseAdmin
    .from("tenants")
    .select("settings")
    .eq("id", t.tenantId)
    .maybeSingle();

  if (confirmError) return dbError("PATCH /api/settings/targets/confirm", confirmError);
  const confirmedSettings = (confirmedTenant?.settings as Record<string, unknown>) || null;
  const persisted =
    confirmedSettings?.shiftStart === updatedSettings.shiftStart &&
    confirmedSettings.shiftEnd === updatedSettings.shiftEnd &&
    confirmedSettings.lunchStart === updatedSettings.lunchStart &&
    confirmedSettings.lunchEnd === updatedSettings.lunchEnd &&
    confirmedSettings.hourlyMetaEnabled === updatedSettings.hourlyMetaEnabled;

  if (!persisted) {
    console.warn("[PATCH /api/settings/targets] settings were not persisted after update");
    return NextResponse.json({ error: "Não foi possível confirmar o salvamento das metas" }, { status: 409 });
  }

  return NextResponse.json({ data: { success: true, settings: confirmedSettings } });
}

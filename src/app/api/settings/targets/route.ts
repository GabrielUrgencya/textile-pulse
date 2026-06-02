import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { hasPermission, type AppRole } from "@/lib/permissions";

interface TenantTargets {
  dailyPiecesTarget: number;
  productivityTarget: number;
  defectTolerance: number;
  lotsTarget: number;
  opsTarget: number;
  shiftStart: string;
  shiftEnd: string;
}

const DEFAULTS: TenantTargets = {
  dailyPiecesTarget: 1000,
  productivityTarget: 85,
  defectTolerance: 3,
  lotsTarget: 100,
  opsTarget: 15,
  shiftStart: "07:00",
  shiftEnd: "17:00",
};

export async function GET() {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;
  const tenantId = user.app_metadata?.tenant_id;

  const { data: tenant } = await supabase
    .from("tenants")
    .select("settings")
    .eq("id", tenantId)
    .single();

  const settings = (tenant?.settings as Record<string, unknown>) || {};

  const targets: TenantTargets = {
    dailyPiecesTarget: (settings.dailyPiecesTarget as number) ?? DEFAULTS.dailyPiecesTarget,
    productivityTarget: (settings.productivityTarget as number) ?? DEFAULTS.productivityTarget,
    defectTolerance: (settings.defectTolerance as number) ?? DEFAULTS.defectTolerance,
    lotsTarget: (settings.lotsTarget as number) ?? DEFAULTS.lotsTarget,
    opsTarget: (settings.opsTarget as number) ?? DEFAULTS.opsTarget,
    shiftStart: (settings.shiftStart as string) ?? DEFAULTS.shiftStart,
    shiftEnd: (settings.shiftEnd as string) ?? DEFAULTS.shiftEnd,
  };

  return NextResponse.json({ data: targets });
}

export async function PATCH(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;
  const role = user.app_metadata?.role;

  if (!hasPermission(role as AppRole, "settings:manage")) {
    return NextResponse.json({ error: "Forbidden: settings:manage required" }, { status: 403 });
  }

  const tenantId = user.app_metadata?.tenant_id;
  const body = await request.json().catch(() => null);

  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Get current settings to merge
  const { data: tenant } = await supabase
    .from("tenants")
    .select("settings")
    .eq("id", tenantId)
    .single();

  const currentSettings = (tenant?.settings as Record<string, unknown>) || {};

  const updatedSettings = {
    ...currentSettings,
    ...(body.dailyPiecesTarget !== undefined && { dailyPiecesTarget: Number(body.dailyPiecesTarget) }),
    ...(body.productivityTarget !== undefined && { productivityTarget: Number(body.productivityTarget) }),
    ...(body.defectTolerance !== undefined && { defectTolerance: Number(body.defectTolerance) }),
    ...(body.lotsTarget !== undefined && { lotsTarget: Number(body.lotsTarget) }),
    ...(body.opsTarget !== undefined && { opsTarget: Number(body.opsTarget) }),
    ...(body.shiftStart !== undefined && { shiftStart: body.shiftStart }),
    ...(body.shiftEnd !== undefined && { shiftEnd: body.shiftEnd }),
  };

  const { error } = await supabase
    .from("tenants")
    .update({ settings: updatedSettings })
    .eq("id", tenantId);

  if (error) {
    return NextResponse.json({ error: "Failed to update targets" }, { status: 500 });
  }

  return NextResponse.json({ data: { success: true } });
}

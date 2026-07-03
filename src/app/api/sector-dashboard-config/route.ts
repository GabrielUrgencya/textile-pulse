import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { dbError } from "@/lib/api-helpers";
import { getSectorDashboardConfig, isValidLayout } from "@/lib/dashboard-config";
import { can } from "@/lib/effective-permissions";
import { publishTvConfig } from "@/lib/realtime";

/**
 * Story 8.38 — Config de KPIs por setor (Dashboards 2.0).
 * GET ?stage_id= : layout salvo OU default (autenticado do tenant).
 * PUT { stage_id, layout } : upsert admin-only por (tenant, stage).
 */

export async function GET(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  const tenantId = user.app_metadata?.tenant_id as string | undefined;
  if (!tenantId) return NextResponse.json({ error: "User has no tenant_id" }, { status: 403 });

  const stageId = new URL(request.url).searchParams.get("stage_id");
  if (!stageId) return NextResponse.json({ error: "stage_id is required" }, { status: 400 });

  const config = await getSectorDashboardConfig(supabase, tenantId, stageId).catch(() => null);
  if (!config) return NextResponse.json({ error: "Failed to load config" }, { status: 500 });

  return NextResponse.json({ data: config });
}

export async function PUT(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  // Story 9.x: permissão dinâmica tv:config (defesa no servidor, não só na UI)
  if (!can(user, "tv:config")) {
    return NextResponse.json({ error: "Forbidden: tv:config required" }, { status: 403 });
  }

  const tenantId = user.app_metadata?.tenant_id as string | undefined;
  if (!tenantId) return NextResponse.json({ error: "User has no tenant_id" }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body?.stage_id || typeof body.stage_id !== "string") {
    return NextResponse.json({ error: "stage_id is required" }, { status: 400 });
  }
  if (!isValidLayout(body.layout)) {
    return NextResponse.json({ error: "Invalid layout shape" }, { status: 400 });
  }

  const { error } = await supabase
    .from("sector_dashboard_configs")
    .upsert(
      {
        tenant_id: tenantId,
        stage_id: body.stage_id,
        layout: body.layout,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,stage_id" },
    );

  if (error) return dbError("PUT /api/sector-dashboard-config", error);

  // Story 8.41 — publica o broadcast tv-config:{tenant} (best-effort, server-side)
  // para a(s) TV(s) recarregarem a config do setor em <2s, sem refresh.
  await publishTvConfig(supabase, tenantId, body.stage_id).catch((e) =>
    console.warn("[sector-dashboard-config] publishTvConfig falhou:", (e as Error)?.message),
  );

  return NextResponse.json({ data: { success: true } });
}

import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { dbError, requireTenantId } from "@/lib/api-helpers";
import { can } from "@/lib/effective-permissions";

/**
 * Story 8.21 — Metas diárias por setor (= etapa) com unidade.
 * GET: lista metas por setor (join com stages para nome).
 * PUT: upsert (stage_id, daily_target, unit) — admin only.
 */

export async function GET() {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  const t = requireTenantId(user);
  if (t.error) return t.error;

  const { data, error } = await supabase
    .from("sector_targets")
    .select("id, stage_id, daily_target, unit, stages(name, display_name, order_index)")
    .eq("tenant_id", t.tenantId);

  if (error) return dbError("GET /api/settings/sector-targets", error);
  return NextResponse.json({ data: data || [] });
}

export async function PUT(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  if (!can(user, "settings:manage")) {
    return NextResponse.json({ error: "Forbidden: settings:manage required" }, { status: 403 });
  }

  const t = requireTenantId(user);
  if (t.error) return t.error;

  const body = await request.json().catch(() => null);
  if (!body?.stage_id) {
    return NextResponse.json({ error: "stage_id é obrigatório" }, { status: 400 });
  }

  const dailyTarget = Math.trunc(Number(body.daily_target));
  if (Number.isNaN(dailyTarget) || dailyTarget < 0) {
    return NextResponse.json({ error: "daily_target deve ser inteiro >= 0" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("sector_targets")
    .upsert(
      {
        tenant_id: t.tenantId,
        stage_id: body.stage_id,
        daily_target: dailyTarget,
        unit: body.unit?.toString().trim() || null,
      },
      { onConflict: "tenant_id,stage_id" },
    )
    .select("id, stage_id, daily_target, unit")
    .single();

  if (error) return dbError("PUT /api/settings/sector-targets", error);
  return NextResponse.json({ data });
}

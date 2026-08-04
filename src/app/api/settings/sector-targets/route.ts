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
    .select("id, stage_id, daily_target, unit, shift_start, shift_end, lunch_start, lunch_end, hourly_target, stages(name, display_name, order_index)")
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

  // Frente 3 — override opcional de jornada e meta/hora por setor (nullable = herda/deriva).
  const hhmm = (v: unknown): string | null => {
    const s = v == null ? "" : String(v).trim();
    return /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(s) ? s : null;
  };
  const hourly = body.hourly_target === "" || body.hourly_target == null ? null : Math.trunc(Number(body.hourly_target));
  if (hourly != null && (Number.isNaN(hourly) || hourly <= 0)) {
    return NextResponse.json({ error: "hourly_target deve ser inteiro > 0 ou vazio" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("sector_targets")
    .upsert(
      {
        tenant_id: t.tenantId,
        stage_id: body.stage_id,
        daily_target: dailyTarget,
        unit: body.unit?.toString().trim() || null,
        shift_start: hhmm(body.shift_start),
        shift_end: hhmm(body.shift_end),
        lunch_start: hhmm(body.lunch_start),
        lunch_end: hhmm(body.lunch_end),
        hourly_target: hourly,
      },
      { onConflict: "tenant_id,stage_id" },
    )
    .select("id, stage_id, daily_target, unit, shift_start, shift_end, lunch_start, lunch_end, hourly_target")
    .single();

  if (error) return dbError("PUT /api/settings/sector-targets", error);
  return NextResponse.json({ data });
}

// DELETE: remove a meta de um processo (?stage_id=...)
export async function DELETE(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  if (!can(user, "settings:manage")) {
    return NextResponse.json({ error: "Forbidden: settings:manage required" }, { status: 403 });
  }

  const t = requireTenantId(user);
  if (t.error) return t.error;

  const { searchParams } = new URL(request.url);
  const stageId = searchParams.get("stage_id");
  if (!stageId) {
    return NextResponse.json({ error: "stage_id é obrigatório" }, { status: 400 });
  }

  const { error } = await supabase
    .from("sector_targets")
    .delete()
    .eq("tenant_id", t.tenantId)
    .eq("stage_id", stageId);

  if (error) return dbError("DELETE /api/settings/sector-targets", error);
  return NextResponse.json({ data: { success: true } });
}

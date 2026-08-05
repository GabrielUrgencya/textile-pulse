import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { dbError, requireTenantId } from "@/lib/api-helpers";
import { can } from "@/lib/effective-permissions";
import { normalizeHourlyTargetMode, validateHourlyTargetInput } from "@/lib/hourly-target-mode";

const TARGET_SELECT = "id, stage_id, daily_target, unit, shift_start, shift_end, lunch_start, lunch_end, hourly_target, hourly_target_mode";

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
  if (!can(user, "settings:manage")) {
    return NextResponse.json({ error: "Forbidden: settings:manage required" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("sector_targets")
    .select(`${TARGET_SELECT}, stages(name, display_name, order_index)`)
    .eq("tenant_id", t.tenantId);

  if (error) return dbError("GET /api/settings/sector-targets", error);
  return NextResponse.json({ data: (data || []).map((row) => ({
    ...row,
    hourly_target_mode: normalizeHourlyTargetMode(row.hourly_target_mode),
  })) });
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

  const { data: ownedStage, error: stageError } = await supabase
    .from("stages")
    .select("id")
    .eq("tenant_id", t.tenantId)
    .eq("id", body.stage_id)
    .maybeSingle();
  if (stageError) return dbError("PUT /api/settings/sector-targets/stage", stageError);
  if (!ownedStage) return NextResponse.json({ error: "Setor não encontrado" }, { status: 404 });

  // Frente 3 — override opcional de jornada e meta/hora por setor (nullable = herda/deriva).
  const hhmm = (v: unknown): string | null => {
    const s = v == null ? "" : String(v).trim();
    return /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(s) ? s : null;
  };
  const hourlyInput = validateHourlyTargetInput(body.hourly_target_mode, body.hourly_target);
  if (!hourlyInput.ok) return NextResponse.json({ error: hourlyInput.error }, { status: 400 });

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
        hourly_target_mode: hourlyInput.mode,
        hourly_target: hourlyInput.manualTarget,
      },
      { onConflict: "tenant_id,stage_id" },
    )
    .select("id")
    .single();

  if (error) return dbError("PUT /api/settings/sector-targets", error);
  if (!data) return NextResponse.json({ error: "Não foi possível confirmar o salvamento" }, { status: 409 });

  const { data: confirmed, error: confirmError } = await supabase
    .from("sector_targets")
    .select(TARGET_SELECT)
    .eq("tenant_id", t.tenantId)
    .eq("stage_id", body.stage_id)
    .maybeSingle();
  if (confirmError) return dbError("PUT /api/settings/sector-targets/confirm", confirmError);
  if (!confirmed
    || normalizeHourlyTargetMode(confirmed.hourly_target_mode) !== hourlyInput.mode
    || (confirmed.hourly_target ?? null) !== hourlyInput.manualTarget) {
    return NextResponse.json({ error: "Não foi possível confirmar o salvamento" }, { status: 409 });
  }
  return NextResponse.json({ data: {
    ...confirmed,
    hourly_target_mode: normalizeHourlyTargetMode(confirmed.hourly_target_mode),
  } });
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

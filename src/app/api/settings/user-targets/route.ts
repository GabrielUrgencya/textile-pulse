import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { dbError, requireTenantId } from "@/lib/api-helpers";
import { can } from "@/lib/effective-permissions";

/**
 * Story 8.21 — Override de meta por usuário (+ etapa atribuída).
 * GET: lista overrides do tenant (join profiles + stages).
 * PUT: upsert por user_id. DELETE: remove override.
 */

export async function GET() {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  const t = requireTenantId(user);
  if (t.error) return t.error;

  const { data, error } = await supabase
    .from("user_targets")
    .select("id, user_id, stage_id, daily_target, unit, profiles(full_name), stages(name, display_name)")
    .eq("tenant_id", t.tenantId);

  if (error) return dbError("GET /api/settings/user-targets", error);
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
  if (!body?.user_id || !body?.stage_id) {
    return NextResponse.json({ error: "user_id e stage_id são obrigatórios" }, { status: 400 });
  }

  let dailyTarget: number | null = null;
  if (body.daily_target !== undefined && body.daily_target !== null && body.daily_target !== "") {
    dailyTarget = Math.trunc(Number(body.daily_target));
    if (Number.isNaN(dailyTarget) || dailyTarget < 0) {
      return NextResponse.json({ error: "daily_target deve ser inteiro >= 0" }, { status: 400 });
    }
  }

  const { data, error } = await supabase
    .from("user_targets")
    .upsert(
      {
        tenant_id: t.tenantId,
        user_id: body.user_id,
        stage_id: body.stage_id,
        daily_target: dailyTarget,
        unit: body.unit?.toString().trim() || null,
      },
      { onConflict: "tenant_id,user_id" },
    )
    .select("id, user_id, stage_id, daily_target, unit")
    .single();

  if (error) return dbError("PUT /api/settings/user-targets", error);
  return NextResponse.json({ data });
}

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
  const userId = searchParams.get("user_id");
  if (!userId) {
    return NextResponse.json({ error: "user_id é obrigatório" }, { status: 400 });
  }

  const { error } = await supabase
    .from("user_targets")
    .delete()
    .eq("tenant_id", t.tenantId)
    .eq("user_id", userId);

  if (error) return dbError("DELETE /api/settings/user-targets", error);
  return NextResponse.json({ data: { success: true } });
}

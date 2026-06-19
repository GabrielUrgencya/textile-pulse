import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { dbError, requireTenantId } from "@/lib/api-helpers";
import { can } from "@/lib/effective-permissions";

/**
 * Story 8.21 — Matriz de coeficiente por referência × etapa.
 * GET: lista todas as células do tenant.
 * PUT: upsert de uma célula (reference, stage_id, coefficient) — admin only.
 * DELETE: remove célula (?reference=&stage_id=).
 */

export async function GET() {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  const t = requireTenantId(user);
  if (t.error) return t.error;

  const { data, error } = await supabase
    .from("reference_stage_targets")
    .select("id, reference, stage_id, coefficient, stages(name, display_name, order_index)")
    .eq("tenant_id", t.tenantId)
    .order("reference", { ascending: true });

  if (error) return dbError("GET /api/settings/reference-stage-targets", error);
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
  const reference = body?.reference?.toString().trim();
  if (!reference || !body?.stage_id) {
    return NextResponse.json({ error: "reference e stage_id são obrigatórios" }, { status: 400 });
  }

  const coefficient = Number(body.coefficient);
  if (Number.isNaN(coefficient) || coefficient < 0) {
    return NextResponse.json({ error: "coefficient deve ser número >= 0" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("reference_stage_targets")
    .upsert(
      {
        tenant_id: t.tenantId,
        reference,
        stage_id: body.stage_id,
        coefficient,
      },
      { onConflict: "tenant_id,reference,stage_id" },
    )
    .select("id, reference, stage_id, coefficient")
    .single();

  if (error) return dbError("PUT /api/settings/reference-stage-targets", error);
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
  const reference = searchParams.get("reference");
  const stageId = searchParams.get("stage_id");
  if (!reference || !stageId) {
    return NextResponse.json({ error: "reference e stage_id são obrigatórios" }, { status: 400 });
  }

  const { error } = await supabase
    .from("reference_stage_targets")
    .delete()
    .eq("tenant_id", t.tenantId)
    .eq("reference", reference)
    .eq("stage_id", stageId);

  if (error) return dbError("DELETE /api/settings/reference-stage-targets", error);
  return NextResponse.json({ data: { success: true } });
}

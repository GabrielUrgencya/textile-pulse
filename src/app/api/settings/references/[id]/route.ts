import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { dbError, requireTenantId } from "@/lib/api-helpers";
import { can } from "@/lib/effective-permissions";

/**
 * Story 8.13 — Edicao/remocao de referencia (tenant-scoped)
 */

// PATCH: atualiza coeficiente/descricao
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  if (!can(user, "settings:manage")) {
    return NextResponse.json(
      { error: "Forbidden: settings:manage required" },
      { status: 403 },
    );
  }

  const t = requireTenantId(user);
  if (t.error) return t.error;

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if (body.meta_coefficient !== undefined) {
    const coef = Number(body.meta_coefficient);
    if (Number.isNaN(coef) || coef <= 0) {
      return NextResponse.json(
        { error: "meta_coefficient deve ser um número maior que 0" },
        { status: 400 },
      );
    }
    update.meta_coefficient = coef;
  }

  if (body.description !== undefined) {
    update.description = body.description?.toString().trim() || null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("reference_targets")
    .update(update)
    .eq("id", params.id)
    .eq("tenant_id", t.tenantId)
    .select("id, reference, meta_coefficient, description, created_at")
    .single();

  if (error) return dbError("PATCH /api/settings/references/[id]", error);
  if (!data) {
    return NextResponse.json({ error: "Referência não encontrada" }, { status: 404 });
  }

  return NextResponse.json({ data });
}

// DELETE: remove referencia
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  if (!can(user, "settings:manage")) {
    return NextResponse.json(
      { error: "Forbidden: settings:manage required" },
      { status: 403 },
    );
  }

  const t = requireTenantId(user);
  if (t.error) return t.error;

  const { error } = await supabase
    .from("reference_targets")
    .delete()
    .eq("id", params.id)
    .eq("tenant_id", t.tenantId);

  if (error) return dbError("DELETE /api/settings/references/[id]", error);

  return NextResponse.json({ data: { success: true } });
}

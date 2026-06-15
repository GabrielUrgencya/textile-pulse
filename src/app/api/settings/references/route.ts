import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { dbError, requireTenantId } from "@/lib/api-helpers";
import { hasPermission, type AppRole } from "@/lib/permissions";

/**
 * Story 8.13 — Cadastro de Referencia com Meta
 * Tabela: reference_targets (tenant_id, reference, meta_coefficient, description)
 */

// GET: lista as referencias do tenant
export async function GET() {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  const t = requireTenantId(user);
  if (t.error) return t.error;

  const { data, error } = await supabase
    .from("reference_targets")
    .select("id, reference, meta_coefficient, description, created_at")
    .eq("tenant_id", t.tenantId)
    .order("reference", { ascending: true });

  if (error) return dbError("GET /api/settings/references", error);

  return NextResponse.json({ data: data || [] });
}

// POST: cria uma referencia
export async function POST(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;
  const role = user.app_metadata?.role;

  if (!hasPermission(role as AppRole, "settings:manage")) {
    return NextResponse.json(
      { error: "Forbidden: settings:manage required" },
      { status: 403 },
    );
  }

  const t = requireTenantId(user);
  if (t.error) return t.error;

  const body = await request.json().catch(() => null);

  const reference = (body?.reference ?? "").toString().trim();
  if (!reference) {
    return NextResponse.json(
      { error: "reference é obrigatório" },
      { status: 400 },
    );
  }

  const coefRaw = body?.meta_coefficient;
  const metaCoefficient = Number(coefRaw);
  if (coefRaw === undefined || coefRaw === null || Number.isNaN(metaCoefficient) || metaCoefficient <= 0) {
    return NextResponse.json(
      { error: "meta_coefficient deve ser um número maior que 0" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("reference_targets")
    .insert({
      tenant_id: t.tenantId,
      reference,
      meta_coefficient: metaCoefficient,
      description: body?.description?.toString().trim() || null,
    })
    .select("id, reference, meta_coefficient, description, created_at")
    .single();

  if (error) {
    if (error.message.includes("unique") || error.message.includes("duplicate")) {
      return NextResponse.json(
        { error: `Referência "${reference}" já cadastrada` },
        { status: 409 },
      );
    }
    return dbError("POST /api/settings/references", error);
  }

  return NextResponse.json({ data }, { status: 201 });
}

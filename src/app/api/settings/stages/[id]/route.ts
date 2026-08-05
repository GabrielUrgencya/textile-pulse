import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";
import { dbError, requireTenantId } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { user } = auth;

  if (!can(user, "settings:manage")) {
    return NextResponse.json({ error: "Forbidden: settings:manage required" }, { status: 403 });
  }

  const t = requireTenantId(user);
  if (t.error) return t.error;

  const { id } = await params;
  const body = await request.json().catch(() => null);

  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  // Renomear: o usuário edita UM nome. name (interno) e display_name (o que a TV,
  // dashboards e setores exibem) andavam separados — por isso renomear "não
  // refletia". Sincronizamos os dois para o mesmo valor.
  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "O nome da etapa não pode ficar vazio" }, { status: 400 });
    updates.name = name;
    updates.display_name = name;
  }
  if (body.displayName !== undefined) {
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    if (!displayName) return NextResponse.json({ error: "O nome de exibição não pode ficar vazio" }, { status: 400 });
    updates.display_name = displayName;
  }
  if (body.color !== undefined) updates.color = body.color;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 });
  }

  // service_role escopado por tenant: garante que a tela nunca minta (contamos as
  // linhas afetadas) e não depende de nuances da policy de UPDATE.
  const { data, error } = await supabaseAdmin
    .from("stages")
    .update(updates)
    .eq("id", id)
    .eq("tenant_id", t.tenantId)
    .select("id");

  if (error) return dbError("PATCH /api/settings/stages/[id]", error);
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Etapa não encontrada" }, { status: 404 });
  }

  return NextResponse.json({ data: { success: true } });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { user } = auth;

  if (!can(user, "settings:manage")) {
    return NextResponse.json({ error: "Forbidden: settings:manage required" }, { status: 403 });
  }

  const t = requireTenantId(user);
  if (t.error) return t.error;

  const { id } = await params;

  // SOFT-DELETE. Um hard-delete: (1) era BLOQUEADO pela RLS (stages não tem policy
  // de DELETE → apagava 0 linhas sem erro e a tela mentia "removida"); (2)
  // destruiria histórico via CASCADE (metas, achievements, config da TV). Então
  // DESATIVAMOS a etapa — ela sai da lista ativa/TV/scan e o histórico fica
  // intacto (scan_events, defeitos, relatórios). service_role escopado por tenant.
  const { data, error } = await supabaseAdmin
    .from("stages")
    .update({ is_active: false })
    .eq("id", id)
    .eq("tenant_id", t.tenantId)
    .eq("is_active", true)
    .select("id");

  if (error) return dbError("DELETE /api/settings/stages/[id]", error);
  if (!data || data.length === 0) {
    // Não existe, é de outro tenant, ou já estava desativada.
    return NextResponse.json({ error: "Etapa não encontrada" }, { status: 404 });
  }

  return NextResponse.json({ data: { success: true, deactivated: true } });
}

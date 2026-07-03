import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { dbError, requireTenantId } from "@/lib/api-helpers";
import { can } from "@/lib/effective-permissions";

/**
 * Story 9.4 — Atribuição de setor(es) por usuário (N:N).
 * GET: lista todos os vínculos do tenant (join profiles + stages).
 * PUT: define o CONJUNTO de setores de um usuário (substitui o que havia).
 *      body: { user_id, stage_ids: string[] } (vazio = remove todos).
 */

export async function GET() {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  const t = requireTenantId(user);
  if (t.error) return t.error;

  const { data, error } = await supabase
    .from("user_stages")
    .select("id, user_id, stage_id, profiles(full_name), stages(name, display_name)")
    .eq("tenant_id", t.tenantId);

  if (error) return dbError("GET /api/settings/user-stages", error);
  return NextResponse.json({ data: data || [] });
}

export async function PUT(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  if (!can(user, "users:manage") && !can(user, "settings:manage")) {
    return NextResponse.json({ error: "Forbidden: users:manage required" }, { status: 403 });
  }

  const t = requireTenantId(user);
  if (t.error) return t.error;

  const body = await request.json().catch(() => null);
  const userId = body?.user_id?.toString();
  const stageIds: string[] = Array.isArray(body?.stage_ids)
    ? Array.from(new Set(body.stage_ids.map((s: unknown) => String(s)).filter(Boolean)))
    : [];
  if (!userId) {
    return NextResponse.json({ error: "user_id é obrigatório" }, { status: 400 });
  }

  // Substitui o conjunto: remove os atuais e insere os novos (transação lógica).
  const { error: delErr } = await supabase
    .from("user_stages")
    .delete()
    .eq("tenant_id", t.tenantId)
    .eq("user_id", userId);
  if (delErr) return dbError("PUT /api/settings/user-stages (delete)", delErr);

  if (stageIds.length > 0) {
    const rows = stageIds.map((stage_id) => ({ tenant_id: t.tenantId, user_id: userId, stage_id }));
    const { error: insErr } = await supabase.from("user_stages").insert(rows);
    if (insErr) return dbError("PUT /api/settings/user-stages (insert)", insErr);
  }

  return NextResponse.json({ data: { user_id: userId, stage_ids: stageIds } });
}

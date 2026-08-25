import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";
import { dbError, requireTenantId } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ensureSalesConsultantMembership } from "@/lib/sales-vendedor-link";

const VALID_ROLES = ["ADMIN", "GERENTE", "COORDENADOR", "OPERADOR", "VENDEDOR"];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;

  if (!can(user, "users:manage")) {
    return NextResponse.json({ error: "Forbidden: users:manage required" }, { status: 403 });
  }

  const t = requireTenantId(user);
  if (t.error) return t.error;

  const { id } = await params;
  const body = await request.json().catch(() => null);

  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Cannot edit own role
  if (id === user.id && body.role) {
    return NextResponse.json({ error: "Cannot change your own role" }, { status: 403 });
  }

  if (body.role !== undefined && !VALID_ROLES.includes(body.role)) {
    return NextResponse.json(
      { error: "Role inválido. Valores permitidos: ADMIN, GERENTE, COORDENADOR, OPERADOR, VENDEDOR" },
      { status: 400 },
    );
  }

  // Confirma que o alvo pertence ao tenant do admin (service role bypassa RLS).
  const { data: target } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("id", id)
    .eq("tenant_id", t.tenantId)
    .maybeSingle();
  if (!target) {
    return NextResponse.json({ error: "Membro não encontrado neste tenant." }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.full_name = body.name;
  if (body.phone !== undefined) updates.phone = body.phone;
  if (body.role !== undefined) updates.role = body.role;
  if (body.sector !== undefined) updates.sector = body.sector;

  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", id);

  if (error) return dbError("PATCH /api/team/members/[id]", error);

  // CRÍTICO: o RBAC lê o cargo de auth.users.app_metadata.role (NÃO de profiles.role).
  // Sem sincronizar aqui, trocar o cargo não mudava as permissões efetivas do usuário.
  if (body.role !== undefined) {
    const { error: metaErr } = await supabaseAdmin.auth.admin.updateUserById(id, {
      app_metadata: { tenant_id: t.tenantId, role: body.role },
    });
    if (metaErr) {
      return NextResponse.json(
        { error: `Cargo salvo, mas a sincronização de permissões falhou: ${metaErr.message}` },
        { status: 500 },
      );
    }
  }

  // Vendedor precisa de vínculo Vendas para ter a que acessar (não tem produção).
  let salesLinkWarning: string | undefined;
  if (body.role === "VENDEDOR") {
    const link = await ensureSalesConsultantMembership(t.tenantId, id);
    if (!link.ok) salesLinkWarning = link.error;
  }

  return NextResponse.json({ data: { success: true, ...(salesLinkWarning ? { salesLinkWarning } : {}) } });
}

// Exclusão DEFINITIVA de membro (auth + profile). Só ADM (users:manage).
// Salvaguarda: se o membro tiver histórico vinculado (FK), orienta a desativar.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { user } = auth;

  if (!can(user, "users:manage")) {
    return NextResponse.json({ error: "Forbidden: users:manage required" }, { status: 403 });
  }
  const t = requireTenantId(user);
  if (t.error) return t.error;

  const { id } = await params;
  if (id === user.id) {
    return NextResponse.json({ error: "Você não pode excluir a si mesmo." }, { status: 403 });
  }

  // Confirma que o membro pertence ao tenant do admin (service role bypassa RLS).
  const { data: target } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name")
    .eq("id", id)
    .eq("tenant_id", t.tenantId)
    .maybeSingle();
  if (!target) {
    return NextResponse.json({ error: "Membro não encontrado neste tenant." }, { status: 404 });
  }

  // Apaga o profile — falha (23503) se houver histórico vinculado por FK.
  const { error: delErr } = await supabaseAdmin
    .from("profiles")
    .delete()
    .eq("id", id)
    .eq("tenant_id", t.tenantId);
  if (delErr) {
    if (delErr.code === "23503") {
      return NextResponse.json(
        { error: "Este membro tem histórico vinculado (vendas, produção, etc.). Desative-o em vez de excluir." },
        { status: 409 },
      );
    }
    return dbError("DELETE /api/team/members/[id]", delErr);
  }

  // Remove o usuário de autenticação. Se falhar, o profile já saiu — reporta aviso.
  const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(id);
  if (authErr) {
    console.error("DELETE member: profile removido, auth falhou", authErr.message);
    return NextResponse.json({ data: { success: true, authWarning: true } });
  }
  return NextResponse.json({ data: { success: true } });
}

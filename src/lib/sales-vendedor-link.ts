import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Garante que um perfil com cargo VENDEDOR tenha vínculo ativo no LISION Vendas.
 *
 * O cargo VENDEDOR não tem permissões de produção (só enxerga o módulo Vendas),
 * então sem um vínculo (sales_memberships) a pessoa ficaria sem acesso a nada.
 * Este helper cria/reativa o vínculo CONSULTANT — idempotente e frictionless.
 *
 * Usa service role (bypassa RLS) porque quem cria/edita o membro é um ADM do
 * Lision (users:manage), que pode não ser um ADM do Vendas. Espelha o INSERT do
 * provisionador (scripts/provision-sales-tenant.mjs), sem nunca rebaixar um ADMIN.
 */
export async function ensureSalesConsultantMembership(
  tenantId: string,
  profileId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data: existing, error: selErr } = await supabaseAdmin
    .from("sales_memberships")
    .select("id, role, is_active")
    .eq("tenant_id", tenantId)
    .eq("profile_id", profileId)
    .maybeSingle();

  if (selErr) return { ok: false, error: selErr.message };

  // Um ADMIN de Vendas é mais privilegiado — nunca rebaixar para CONSULTANT.
  if (existing?.role === "ADMIN") return { ok: true };

  if (!existing) {
    const { error: insErr } = await supabaseAdmin
      .from("sales_memberships")
      .insert({ tenant_id: tenantId, profile_id: profileId, role: "CONSULTANT", is_active: true });
    if (insErr) return { ok: false, error: insErr.message };
    return { ok: true };
  }

  if (!existing.is_active) {
    const { error: updErr } = await supabaseAdmin
      .from("sales_memberships")
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (updErr) return { ok: false, error: updErr.message };
  }
  return { ok: true };
}

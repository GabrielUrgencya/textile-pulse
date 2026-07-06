import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";
import { dbError, requireTenantId } from "@/lib/api-helpers";

/**
 * GET /api/my-plan/users — Lista de usuários do tenant para o filtro do admin
 * no módulo Meu Plano (épico Meu Plano). Admin only.
 */
export async function GET() {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  if (!can(user, "settings:manage")) {
    return NextResponse.json({ error: "Forbidden: settings:manage required" }, { status: 403 });
  }

  const t = requireTenantId(user);
  if (t.error) return t.error;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, sector")
    .eq("tenant_id", t.tenantId)
    .order("full_name", { ascending: true });

  if (error) return dbError("GET /api/my-plan/users", error);
  return NextResponse.json({ data: data || [] });
}

import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { dbError, requireTenantId } from "@/lib/api-helpers";
import bcrypt from "bcryptjs";
import { randomInt } from "crypto";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { user } = auth;

  if (!can(user, "users:manage")) {
    return NextResponse.json({ error: "Forbidden: users:manage required" }, { status: 403 });
  }

  // SEGURANÇA: escopar ao tenant do admin. A rota usa service_role (bypassa RLS);
  // sem este filtro, um admin poderia resetar o PIN de um usuário de OUTRO tenant
  // (invasão cross-tenant via login por PIN).
  const t = requireTenantId(user);
  if (t.error) return t.error;

  const { id } = await params;

  // Generate secure PIN
  const pin = String(randomInt(100000, 999999));
  const pinHash = await bcrypt.hash(pin, 10);

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update({ pin_code: pinHash })
    .eq("id", id)
    .eq("tenant_id", t.tenantId)
    .select("id");

  if (error) return dbError("PATCH /api/team/members/[id]/reset-pin", error);
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Membro não encontrado" }, { status: 404 });
  }

  return NextResponse.json({ data: { pin } });
}

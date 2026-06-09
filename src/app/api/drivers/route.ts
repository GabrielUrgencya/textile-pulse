import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";

const ALLOWED_ROLES = ["ADMIN", "GERENTE", "COORDENADOR"];

/**
 * GET /api/drivers — List active drivers for the tenant
 * Story 8.6 — needed for driver selection in OpsClock
 */
export async function GET() {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;
  const role = user.app_metadata?.role;

  if (!ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenantId = user.app_metadata?.tenant_id;
  if (!tenantId) {
    return NextResponse.json({ error: "No tenant" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("drivers")
    .select("id, name, vehicle_plate")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data || [] });
}

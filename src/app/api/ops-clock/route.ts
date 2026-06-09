import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { requireTenantId } from "@/lib/api-helpers";

const ALLOWED_ROLES = ["ADMIN", "GERENTE", "COORDENADOR"];

/**
 * POST /api/ops-clock — Register driver arrival
 * Story 8.6 — AC1
 */
export async function POST(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;
  const role = user.app_metadata?.role;

  if (!ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const t = requireTenantId(user);
  if (t.error) return t.error;

  let body: { driverId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.driverId) {
    return NextResponse.json({ error: "driverId is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("ops_clock")
    .insert({
      tenant_id: t.tenantId,
      driver_id: body.driverId,
      arrived_at: new Date().toISOString(),
      registered_by: user.id,
    })
    .select("id, driver_id, arrived_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}

/**
 * GET /api/ops-clock — List ops clock records
 * Story 8.6 — AC7
 */
export async function GET(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;
  const role = user.app_metadata?.role;

  if (!ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const today = new Date().toISOString().slice(0, 10);
  const from = searchParams.get("from") || today;
  const active = searchParams.get("active"); // "true" = only active (not departed)

  let query = supabase
    .from("ops_clock")
    .select("id, driver_id, arrived_at, loading_started_at, loading_ended_at, departed_at, drivers(name, vehicle_plate)")
    .gte("arrived_at", `${from}T00:00:00`)
    .order("arrived_at", { ascending: false });

  if (active === "true") {
    query = query.is("departed_at", null);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data || [] });
}

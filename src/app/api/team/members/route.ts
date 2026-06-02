import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { hasPermission, type AppRole } from "@/lib/permissions";
import { escapeLikePattern } from "@/lib/utils";
import { supabaseAdmin } from "@/lib/supabase-admin";
import bcrypt from "bcryptjs";
import { randomInt } from "crypto";

export async function GET(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;
  const role = user.app_metadata?.role;

  if (!hasPermission(role as AppRole, "users:manage")) {
    return NextResponse.json({ error: "Forbidden: users:manage required" }, { status: 403 });
  }

  const url = new URL(request.url);
  const search = url.searchParams.get("search") || "";
  const roleFilter = url.searchParams.get("role") || "";
  const active = url.searchParams.get("active") !== "false";

  let query = supabase
    .from("profiles")
    .select("id, full_name, email, phone, role, sector, is_active, created_at")
    .order("created_at", { ascending: false });

  if (active) {
    query = query.eq("is_active", true);
  } else {
    query = query.eq("is_active", false);
  }

  if (search) {
    query = query.ilike("full_name", `%${escapeLikePattern(search)}%`);
  }

  if (roleFilter) {
    query = query.eq("role", roleFilter);
  }

  const { data: members, error } = await query;

  if (error) {
    return NextResponse.json({ error: "Failed to fetch members" }, { status: 500 });
  }

  return NextResponse.json({ data: members || [] });
}

export async function POST(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { user } = auth;
  const role = user.app_metadata?.role;

  if (!hasPermission(role as AppRole, "users:manage")) {
    return NextResponse.json({ error: "Forbidden: users:manage required" }, { status: 403 });
  }

  const tenantId = user.app_metadata?.tenant_id;
  const body = await request.json().catch(() => null);

  if (!body?.name || !body?.role || !body?.sector) {
    return NextResponse.json({ error: "name, role, and sector are required" }, { status: 400 });
  }

  // M4 FIX: Validate role against allowed enum values
  const VALID_ROLES = ["ADMIN", "GERENTE", "COORDENADOR", "OPERADOR"];
  if (!VALID_ROLES.includes(body.role)) {
    return NextResponse.json(
      { error: "Role inválido. Valores permitidos: ADMIN, GERENTE, COORDENADOR, OPERADOR" },
      { status: 400 },
    );
  }

  // For operators, email is optional — use dummy if not provided
  const email = body.email || `operador-${crypto.randomUUID().slice(0, 8)}@lision.internal`;

  // Create Supabase Auth user
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: crypto.randomUUID(), // Random password for non-email users
    email_confirm: true,
    app_metadata: {
      tenant_id: tenantId,
      role: body.role,
    },
  });

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  // Hash PIN if provided (for operators)
  let pinHash: string | null = null;
  let pin: string | undefined;
  if (body.pin) {
    pin = body.pin;
    pinHash = await bcrypt.hash(body.pin, 10);
  } else if (body.role === "OPERADOR") {
    pin = String(randomInt(100000, 999999));
    pinHash = await bcrypt.hash(pin, 10);
  }

  // Create profile
  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .insert({
      id: authData.user.id,
      tenant_id: tenantId,
      auth_user_id: authData.user.id,
      full_name: body.name,
      email: body.email || null,
      phone: body.phone || null,
      role: body.role,
      sector: body.sector,
      pin_code: pinHash,
    });

  if (profileError) {
    return NextResponse.json({ error: "Failed to create profile" }, { status: 500 });
  }

  return NextResponse.json(
    { data: { id: authData.user.id, pin } },
    { status: 201 },
  );
}

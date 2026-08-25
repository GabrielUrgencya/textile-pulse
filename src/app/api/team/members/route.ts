import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";
import { dbError, requireTenantId } from "@/lib/api-helpers";
import { escapeLikePattern } from "@/lib/utils";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ensureSalesConsultantMembership } from "@/lib/sales-vendedor-link";
import { todayInTz, TENANT_UTC_OFFSET } from "@/lib/tz";
import bcrypt from "bcryptjs";
import { randomInt } from "crypto";

export async function GET(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;

  if (!can(user, "users:manage")) {
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

  if (error) return dbError("GET /api/team/members", error);

  // Produção de HOJE por operador — a confirmação do "Zerar progresso" precisa
  // mostrar quantas bipagens serão perdidas ANTES do admin confirmar.
  // Uma query só para a lista inteira (nada de N+1 por linha da tabela).
  const list = members || [];
  const todayScans: Record<string, number> = {};
  if (list.length > 0) {
    const today = todayInTz();
    const { data: scans } = await supabase
      .from("scan_events")
      .select("user_id")
      .is("disregarded_at", null)
      .eq("event_type", "STAGE_OUT")
      .in(
        "user_id",
        list.map((m) => m.id),
      )
      .gte("scanned_at", `${today}T00:00:00${TENANT_UTC_OFFSET}`)
      .lt("scanned_at", `${today}T23:59:59.999${TENANT_UTC_OFFSET}`);

    for (const s of scans || []) {
      const uid = (s as { user_id: string }).user_id;
      todayScans[uid] = (todayScans[uid] || 0) + 1;
    }
  }

  return NextResponse.json({
    data: list.map((m) => ({ ...m, today_scans: todayScans[m.id] || 0 })),
  });
}

export async function POST(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { user } = auth;

  if (!can(user, "users:manage")) {
    return NextResponse.json({ error: "Forbidden: users:manage required" }, { status: 403 });
  }

  const t = requireTenantId(user);
  if (t.error) return t.error;
  const body = await request.json().catch(() => null);

  if (!body?.name || !body?.role || !body?.sector) {
    return NextResponse.json({ error: "name, role, and sector are required" }, { status: 400 });
  }

  // M4 FIX: Validate role against allowed enum values
  const VALID_ROLES = ["ADMIN", "GERENTE", "COORDENADOR", "OPERADOR", "VENDEDOR"];
  if (!VALID_ROLES.includes(body.role)) {
    return NextResponse.json(
      { error: "Role inválido. Valores permitidos: ADMIN, GERENTE, COORDENADOR, OPERADOR, VENDEDOR" },
      { status: 400 },
    );
  }

  // For operators, email is optional — use dummy if not provided
  const email = body.email || `operador-${crypto.randomUUID().slice(0, 8)}@lision.internal`;

  // Use provided password or generate random for operators without one
  const userPassword = body.password || crypto.randomUUID();

  // Create Supabase Auth user
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: userPassword,
    email_confirm: true,
    app_metadata: {
      tenant_id: t.tenantId,
      role: body.role,
    },
  });

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  // Hash PIN — if provided use it, otherwise auto-generate for all roles
  let pinHash: string | null = null;
  let pin: string | undefined;
  if (body.pin) {
    pin = body.pin;
    pinHash = await bcrypt.hash(body.pin, 10);
  } else {
    pin = String(randomInt(100000, 999999));
    pinHash = await bcrypt.hash(pin, 10);
  }

  // Create profile
  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .insert({
      id: authData.user.id,
      tenant_id: t.tenantId,
      full_name: body.name,
      email: body.email || null,
      phone: body.phone || null,
      role: body.role,
      sector: body.sector,
      pin_code: pinHash,
    });

  if (profileError) return dbError("POST /api/team/members", profileError);

  // Vendedor precisa de vínculo Vendas para ter a que acessar (não tem produção).
  let salesLinkWarning: string | undefined;
  if (body.role === "VENDEDOR") {
    const link = await ensureSalesConsultantMembership(t.tenantId, authData.user.id);
    if (!link.ok) salesLinkWarning = link.error;
  }

  return NextResponse.json(
    { data: { id: authData.user.id, pin, ...(salesLinkWarning ? { salesLinkWarning } : {}) } },
    { status: 201 },
  );
}

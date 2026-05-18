import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import bcrypt from "bcryptjs";

/**
 * POST /api/admin/faction-tokens — Generate faction token + PIN
 * GET  /api/admin/faction-tokens — List faction tokens for tenant
 * Story 6.7 — AC1, AC2, AC3, AC4, AC6, AC7
 */

const ALLOWED_ROLES = ["ADMIN", "GERENTE"];
const PORTAL_BASE_URL = "https://liserie.lision.app/portal";

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // AC6: Only ADMIN or GERENTE
  const role = user.app_metadata?.role;
  if (!ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: "Forbidden: ADMIN or GERENTE role required" }, { status: 403 });
  }

  const tenantId = user.app_metadata?.tenant_id;
  if (!tenantId) {
    return NextResponse.json({ error: "User has no tenant_id in metadata" }, { status: 403 });
  }

  let body: { faction_id: string; name: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // AC2: faction_id and name required
  if (!body.faction_id || !body.name) {
    return NextResponse.json(
      { error: "faction_id and name are required" },
      { status: 400 }
    );
  }

  // Verify faction belongs to tenant
  const { data: faction, error: factionError } = await supabase
    .from("factions")
    .select("id, name")
    .eq("id", body.faction_id)
    .eq("tenant_id", tenantId)
    .single();

  if (factionError || !faction) {
    return NextResponse.json({ error: "Faction not found" }, { status: 404 });
  }

  // AC3: Generate secure 6-digit PIN
  const pin = Math.floor(100000 + Math.random() * 900000).toString();
  const pinHash = await bcrypt.hash(pin, 10);

  // AC1: Insert token
  const { data: token, error: insertError } = await supabase
    .from("faction_tokens")
    .insert({
      tenant_id: tenantId,
      faction_id: body.faction_id,
      name: body.name,
      pin_hash: pinHash,
    })
    .select("id, token, name, faction_id, is_active, created_at")
    .single();

  if (insertError) {
    console.error("[admin/faction-tokens] Insert error:", insertError);
    return NextResponse.json(
      { error: "Failed to create faction token", details: insertError.message },
      { status: 500 }
    );
  }

  // AC7: Formatted URL
  const portalUrl = `${PORTAL_BASE_URL}?token=${token.token}`;

  return NextResponse.json(
    {
      token: {
        ...token,
        factionName: faction.name,
      },
      pin, // AC3: PIN exposed only this once
      portalUrl,
    },
    { status: 201 }
  );
}

export async function GET() {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // AC6: Only ADMIN or GERENTE
  const role = user.app_metadata?.role;
  if (!ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: "Forbidden: ADMIN or GERENTE role required" }, { status: 403 });
  }

  // AC4: List tokens without pin_hash
  const { data: tokens, error } = await supabase
    .from("faction_tokens")
    .select("id, token, name, faction_id, is_active, last_accessed_at, created_at, factions!inner(name)")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch faction tokens" },
      { status: 500 }
    );
  }

  return NextResponse.json({ tokens: tokens || [] });
}

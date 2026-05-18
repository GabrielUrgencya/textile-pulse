import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

/**
 * POST /api/admin/kiosk-tokens — Create kiosk token (ADMIN only)
 * GET  /api/admin/kiosk-tokens — List kiosk tokens for tenant (ADMIN only)
 */

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // AC2: Only ADMIN can create tokens
  const role = user.app_metadata?.role;
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden: ADMIN role required" }, { status: 403 });
  }

  const tenantId = user.app_metadata?.tenant_id;
  if (!tenantId) {
    return NextResponse.json({ error: "User has no tenant_id in metadata" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);

  if (!body?.name) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 }
    );
  }

  const { data: token, error: insertError } = await supabase
    .from("kiosk_tokens")
    .insert({
      tenant_id: tenantId,
      name: body.name,
      scope: body.scope || "dashboard",
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json(
      { error: "Failed to create kiosk token", details: insertError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ token }, { status: 201 });
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

  // AC3: Only ADMIN can list tokens
  const role = user.app_metadata?.role;
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden: ADMIN role required" }, { status: 403 });
  }

  const { data: tokens, error } = await supabase
    .from("kiosk_tokens")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch kiosk tokens" },
      { status: 500 }
    );
  }

  return NextResponse.json({ tokens: tokens || [] });
}

import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";
import { dbError } from "@/lib/api-helpers";

/**
 * POST /api/admin/kiosk-tokens — Create kiosk token (ADMIN only)
 * GET  /api/admin/kiosk-tokens — List kiosk tokens for tenant (ADMIN only)
 */

export async function POST(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  // AC2 + Story 9.x: quem gere configurações OU tem tv:view/tv:config pode criar tokens
  if (!can(user, "settings:manage") && !can(user, "tv:view") && !can(user, "tv:config")) {
    return NextResponse.json({ error: "Forbidden: tv:view required" }, { status: 403 });
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
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  // AC3 + Story 9.x: quem gere configurações OU tem tv:view/tv:config pode listar tokens
  if (!can(user, "settings:manage") && !can(user, "tv:view") && !can(user, "tv:config")) {
    return NextResponse.json({ error: "Forbidden: tv:view required" }, { status: 403 });
  }

  const { data: tokens, error } = await supabase
    .from("kiosk_tokens")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return dbError("GET /api/admin/kiosk-tokens", error);

  return NextResponse.json({ tokens: tokens || [] });
}

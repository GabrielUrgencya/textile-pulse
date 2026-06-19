import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";

/**
 * DELETE /api/admin/kiosk-tokens/:id — Revoke kiosk token (ADMIN only)
 * AC4, AC7: Token revogável, sem expiração automática
 */

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;
  if (!can(user, "settings:manage")) {
    return NextResponse.json({ error: "Forbidden: ADMIN role required" }, { status: 403 });
  }

  const { id } = params;

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return NextResponse.json({ error: "Invalid token ID format" }, { status: 400 });
  }

  // Revoke by setting is_active to false (soft delete)
  const { data: token, error: updateError } = await supabase
    .from("kiosk_tokens")
    .update({ is_active: false })
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json(
      { error: "Token not found or already revoked" },
      { status: 404 }
    );
  }

  return NextResponse.json({ token, revoked: true });
}

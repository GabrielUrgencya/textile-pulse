import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";

/**
 * DELETE /api/admin/faction-tokens/[id] — Revoke faction token (soft delete)
 * Story 6.7 — AC5, AC6
 */


export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  // AC6: Only ADMIN or GERENTE
  if (!can(user, "factions:manage")) {
    return NextResponse.json({ error: "Forbidden: factions:manage required" }, { status: 403 });
  }

  const { id } = await params;

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return NextResponse.json({ error: "Invalid token ID format" }, { status: 400 });
  }

  // AC5: Soft delete — set is_active = false
  const { data: token, error: updateError } = await supabase
    .from("faction_tokens")
    .update({ is_active: false })
    .eq("id", id)
    .select("id, token, name, faction_id, is_active")
    .single();

  if (updateError) {
    return NextResponse.json(
      { error: "Token not found or already revoked" },
      { status: 404 }
    );
  }

  return NextResponse.json({ token, revoked: true });
}

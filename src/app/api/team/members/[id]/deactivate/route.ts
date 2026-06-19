import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";
import { dbError } from "@/lib/api-helpers";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;

  if (!can(user, "users:manage")) {
    return NextResponse.json({ error: "Forbidden: users:manage required" }, { status: 403 });
  }

  const { id } = await params;

  // Cannot deactivate yourself
  if (id === user.id) {
    return NextResponse.json({ error: "Cannot deactivate yourself" }, { status: 403 });
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      is_active: false,
      deleted_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return dbError("PATCH /api/team/members/[id]/deactivate", error);

  return NextResponse.json({ data: { success: true } });
}

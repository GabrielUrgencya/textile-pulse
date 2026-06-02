import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { hasPermission, type AppRole } from "@/lib/permissions";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;
  const role = user.app_metadata?.role;

  if (!hasPermission(role as AppRole, "users:manage")) {
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

  if (error) {
    return NextResponse.json({ error: "Failed to deactivate member" }, { status: 500 });
  }

  return NextResponse.json({ data: { success: true } });
}

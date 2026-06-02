import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { hasPermission, type AppRole } from "@/lib/permissions";

export async function PATCH(
  request: Request,
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
  const body = await request.json().catch(() => null);

  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Cannot edit own role
  if (id === user.id && body.role) {
    return NextResponse.json({ error: "Cannot change your own role" }, { status: 403 });
  }

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.full_name = body.name;
  if (body.phone !== undefined) updates.phone = body.phone;
  if (body.role !== undefined) updates.role = body.role;
  if (body.sector !== undefined) updates.sector = body.sector;

  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "Failed to update member" }, { status: 500 });
  }

  return NextResponse.json({ data: { success: true } });
}

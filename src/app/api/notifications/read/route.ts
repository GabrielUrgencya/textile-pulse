import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";

/**
 * PATCH /api/notifications/read
 * Marks notifications as read. Accepts { ids: string[] } or { all: true }.
 */
export async function PATCH(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;
  const body = await request.json().catch(() => null);

  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const userId = user.id;
  const now = new Date().toISOString();

  if (body.all === true) {
    // H4 FIX: Only mark notifications owned by this user as read.
    // Broadcast notifications (user_id IS NULL) are NOT updated here to avoid
    // marking them as read for all users. TODO: create notification_reads table
    // for per-user broadcast read tracking.
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: now })
      .is("read_at", null)
      .eq("user_id", userId);

    if (error) {
      return NextResponse.json({ error: "Erro ao marcar notificações" }, { status: 500 });
    }

    return NextResponse.json({ data: { success: true } });
  }

  if (Array.isArray(body.ids) && body.ids.length > 0) {
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: now })
      .in("id", body.ids)
      .is("read_at", null);

    if (error) {
      return NextResponse.json({ error: "Erro ao marcar notificações" }, { status: 500 });
    }

    return NextResponse.json({ data: { success: true } });
  }

  return NextResponse.json({ error: "Provide { ids: [...] } or { all: true }" }, { status: 400 });
}

import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { dbError } from "@/lib/api-helpers";

/**
 * GET /api/notifications?unread=true
 * Returns notifications for the current user/tenant, ordered by date desc.
 */
export async function GET(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;
  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get("unread") === "true";

  const userId = user.id;
  const role = user.app_metadata?.role as string | undefined;

  let query = supabase
    .from("notifications")
    .select("id, type, title, message, severity, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  // Filter: user-specific OR broadcast (user_id IS NULL) OR role-targeted
  // Using or filter: user_id = current user OR user_id is null
  query = query.or(`user_id.eq.${userId},user_id.is.null${role ? `,target_role.eq.${role}` : ""}`);

  if (unreadOnly) {
    query = query.is("read_at", null);
  }

  const { data: notifications, error } = await query;

  if (error) return dbError("GET /api/notifications", error);

  const items = (notifications || []).map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    severity: (n.severity || "INFO").toLowerCase(),
    isRead: !!n.read_at,
    createdAt: n.created_at,
  }));

  return NextResponse.json({ data: items });
}

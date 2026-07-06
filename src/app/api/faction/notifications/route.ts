import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateFactionSession } from "@/lib/faction-middleware";
import { dbError } from "@/lib/api-helpers";

/**
 * GET /api/faction/notifications?page=1&limit=20
 * AC8: Returns notifications for this faction (by faction_id OR target_role = FACCAO).
 */
export async function GET(request: Request) {
  const session = await validateFactionSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20")));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Somente notificações DESTA facção com audience FACTION (antes filtrava só
  // tenant_id e vazava notificações do admin para o portal).
  const { data, count, error } = await supabase
    .from("notifications")
    .select("id, type, title, message, severity, read_at, created_at, entity_type, entity_id", { count: "exact" })
    .eq("tenant_id", session.tenantId)
    .eq("faction_id", session.factionId)
    .eq("audience", "FACTION")
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) return dbError("GET /api/faction/notifications", error);

  // Badge: contagem de não lidas com os mesmos filtros.
  const { count: unreadCount } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", session.tenantId)
    .eq("faction_id", session.factionId)
    .eq("audience", "FACTION")
    .is("read_at", null);

  return NextResponse.json({
    data: data || [],
    unreadCount: unreadCount ?? 0,
    pagination: {
      page,
      limit,
      total: count ?? 0,
      totalPages: Math.ceil((count ?? 0) / limit),
    },
  });
}

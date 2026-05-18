import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateFactionSession } from "@/lib/faction-middleware";

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

  // Notifications directed to this faction OR to role FACCAO within the tenant
  const { data, count, error } = await supabase
    .from("notifications")
    .select("id, type, title, message, severity, read_at, created_at", { count: "exact" })
    .eq("tenant_id", session.tenantId)
    .or(`faction_id.eq.${session.factionId},target_role.eq.FACCAO`)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }

  return NextResponse.json({
    data: data || [],
    pagination: {
      page,
      limit,
      total: count ?? 0,
      totalPages: Math.ceil((count ?? 0) / limit),
    },
  });
}

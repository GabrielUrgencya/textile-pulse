import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";

const ALLOWED_ROLES = ["ADMIN", "GERENTE"];

/**
 * GET /api/dashboard/team-ranking — Top 5 team members by weighted productivity
 * Story 8.10 — AC1-AC4, AC6
 */
export async function GET(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;
  const role = user.app_metadata?.role;

  if (!ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenantId = user.app_metadata?.tenant_id;
  if (!tenantId) {
    return NextResponse.json({ error: "No tenant" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") || "today";

  // Calculate period start
  const now = new Date();
  let periodStart: string;

  switch (period) {
    case "week":
      periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      break;
    case "month":
      periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      break;
    case "today":
    default:
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      break;
  }

  // Get scan events with lots and production orders for meta_coefficient
  const { data: scans, error } = await supabase
    .from("scan_events")
    .select(`
      user_id,
      quantity_scanned,
      lots!inner(
        po_id,
        production_orders!inner(
          tenant_id,
          meta_coefficient
        )
      )
    `).is("disregarded_at", null)
    .eq("event_type", "STAGE_IN")
    .gte("scanned_at", periodStart);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Aggregate by user, filtering by tenant
  const userMap = new Map<string, { points: number; scanCount: number }>();

  for (const scan of scans || []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lot = scan.lots as any;
    const po = lot?.production_orders;
    if (!po || po.tenant_id !== tenantId) continue;

    const qty = scan.quantity_scanned || 0;
    const coeff = Number(po.meta_coefficient) || 1.0;
    const points = qty * coeff;

    const existing = userMap.get(scan.user_id);
    if (existing) {
      existing.points += points;
      existing.scanCount++;
    } else {
      userMap.set(scan.user_id, { points, scanCount: 1 });
    }
  }

  // Get top 5 user IDs
  const sorted = Array.from(userMap.entries())
    .sort((a, b) => b[1].points - a[1].points)
    .slice(0, 5);

  if (sorted.length === 0) {
    return NextResponse.json({ data: [] });
  }

  // Fetch profiles
  const userIds = sorted.map(([id]) => id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, sector, avatar_url")
    .in("id", userIds);

  const profileMap = new Map(
    (profiles || []).map((p) => [p.id, p])
  );

  const ranking = sorted.map(([userId, stats], index) => {
    const profile = profileMap.get(userId);
    return {
      rank: index + 1,
      userId,
      name: profile?.full_name || "Colaborador",
      sector: profile?.sector || null,
      avatarUrl: profile?.avatar_url || null,
      points: Math.round(stats.points),
      scanCount: stats.scanCount,
    };
  });

  return NextResponse.json({ data: ranking });
}

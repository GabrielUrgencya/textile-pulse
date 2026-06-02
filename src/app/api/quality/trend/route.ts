import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { hasPermission, type AppRole } from "@/lib/permissions";

export async function GET(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;
  const role = user.app_metadata?.role;

  if (!hasPermission(role as AppRole, "quality:view")) {
    return NextResponse.json({ error: "Forbidden: quality:view required" }, { status: 403 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const interval = url.searchParams.get("interval") || "day";

  let query = supabase
    .from("defect_records")
    .select("created_at")
    .order("created_at", { ascending: true });

  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to);

  const { data: records, error } = await query;

  if (error) {
    return NextResponse.json({ error: "Failed to fetch trend data" }, { status: 500 });
  }

  // Group by date interval
  const buckets = new Map<string, number>();

  for (const r of records || []) {
    const date = new Date(r.created_at);
    let key: string;

    if (interval === "week") {
      // ISO week: get Monday of the week
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(date);
      monday.setDate(diff);
      key = monday.toISOString().split("T")[0];
    } else {
      key = date.toISOString().split("T")[0];
    }

    buckets.set(key, (buckets.get(key) || 0) + 1);
  }

  const trend = Array.from(buckets.entries())
    .map(([period, count]) => ({ period, count }))
    .sort((a, b) => a.period.localeCompare(b.period));

  const hasData = trend.some((t) => t.count > 0);

  return NextResponse.json({ data: trend, hasData });
}

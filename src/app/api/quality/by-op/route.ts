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

  let query = supabase
    .from("defect_records")
    .select("production_order_id, defect_type, severity, production_orders(code)");

  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to);

  const { data: records, error } = await query;

  if (error) {
    return NextResponse.json({ error: "Failed to fetch defects by OP" }, { status: 500 });
  }

  const opMap = new Map<string, { code: string; count: number; critical: number }>();

  for (const r of records || []) {
    const opId = r.production_order_id || "unknown";
    const poRaw = r.production_orders as unknown;
    const code = (poRaw as { code: string } | null)?.code || "Sem OP";
    const entry = opMap.get(opId) || { code, count: 0, critical: 0 };
    entry.count++;
    if (r.severity === "CRITICAL") entry.critical++;
    opMap.set(opId, entry);
  }

  const ops = Array.from(opMap.entries())
    .map(([id, data]) => ({
      production_order_id: id,
      code: data.code,
      defect_count: data.count,
      critical_count: data.critical,
    }))
    .sort((a, b) => b.defect_count - a.defect_count);

  return NextResponse.json({ data: ops });
}

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

  // Join via lots → stages (current_stage_id) since previous_stage_id column doesn't exist yet
  let query = supabase
    .from("defect_records")
    .select("defect_type, lots(stages(name))");

  if (from) query = query.gte("detected_at", from);
  if (to) query = query.lte("detected_at", to);

  const { data: records, error } = await query;

  if (error) {
    console.error("[quality/by-type]", error.message, error.details, error.hint);
    return NextResponse.json({ error: "Failed to fetch defects by type", details: error.message }, { status: 500 });
  }

  // Group by type
  const typeMap = new Map<string, { count: number; stages: Map<string, number> }>();

  for (const r of records || []) {
    const entry = typeMap.get(r.defect_type) || { count: 0, stages: new Map() };
    entry.count++;
    const lot = r.lots as unknown as { stages: { name: string } | null } | null;
    const stageName = lot?.stages?.name || "Sem etapa";
    entry.stages.set(stageName, (entry.stages.get(stageName) || 0) + 1);
    typeMap.set(r.defect_type, entry);
  }

  const total = records?.length || 0;

  const types = Array.from(typeMap.entries())
    .map(([type, data]) => ({
      defect_type: type,
      count: data.count,
      percentage: total > 0 ? Math.round((data.count / total) * 1000) / 10 : 0,
      top_stages: Array.from(data.stages.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, count]) => ({ name, count })),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return NextResponse.json({ data: types });
}

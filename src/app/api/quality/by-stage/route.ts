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
    .select("defect_type, stage_id, stages(name)");

  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to);

  const { data: records, error } = await query;

  if (error) {
    return NextResponse.json({ error: "Failed to fetch defects by stage" }, { status: 500 });
  }

  // Build matrix: stage x defect_type
  const stageTypes = new Map<string, Map<string, number>>();
  const allTypes = new Set<string>();

  for (const r of records || []) {
    const stagesRaw = r.stages as unknown;
    const stageName = (stagesRaw as { name: string } | null)?.name || "Sem etapa";
    allTypes.add(r.defect_type);

    const stageMap = stageTypes.get(stageName) || new Map();
    stageMap.set(r.defect_type, (stageMap.get(r.defect_type) || 0) + 1);
    stageTypes.set(stageName, stageMap);
  }

  const matrix = Array.from(stageTypes.entries()).map(([stage, types]) => ({
    stage,
    types: Object.fromEntries(types),
  }));

  return NextResponse.json({
    data: {
      stages: matrix,
      defect_types: Array.from(allTypes),
    },
  });
}

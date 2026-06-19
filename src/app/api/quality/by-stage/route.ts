import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";

export async function GET(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;

  if (!can(user, "quality:view")) {
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
    console.error("[quality/by-stage]", error.message, error.details, error.hint);
    return NextResponse.json({ error: "Failed to fetch defects by stage", details: error.message }, { status: 500 });
  }

  // Build matrix: stage x defect_type
  const stageTypes = new Map<string, Map<string, number>>();
  const allTypes = new Set<string>();

  for (const r of records || []) {
    const lot = r.lots as unknown as { stages: { name: string } | null } | null;
    const stageName = lot?.stages?.name || "Sem etapa";
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

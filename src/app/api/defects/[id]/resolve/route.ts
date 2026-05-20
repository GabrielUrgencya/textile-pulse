import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";

const STAGE_STATUS_MAP: Record<string, string> = {
  CORTE: "IN_CUT",
  AVIAMENTOS: "IN_TRIMS",
  PRODUCAO: "IN_PRODUCTION",
  TRAVETE: "IN_FINISHING",
  LIMPEZA: "IN_CLEANING",
  CONFERENCIA: "IN_QUALITY",
  EMBALAGEM: "IN_PACKING",
  ESTOQUE: "IN_STOCK",
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  const { id } = await params;

  let body: { resolution?: string } = {};
  try {
    body = await request.json();
  } catch {
    // resolution is optional
  }

  // 1. Fetch defect record
  const { data: defect, error: defectError } = await supabase
    .from("defect_records")
    .select("id, lot_id, status, previous_stage_id, quantity")
    .eq("id", id)
    .single();

  if (defectError || !defect) {
    return NextResponse.json({ error: "Defect record not found" }, { status: 404 });
  }

  if (defect.status === "RESOLVED") {
    return NextResponse.json({ error: "Defect already resolved" }, { status: 409 });
  }

  // 2. Update defect_record → RESOLVED
  const { error: updateDefectError } = await supabase
    .from("defect_records")
    .update({
      status: "RESOLVED",
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
      resolved_quantity: defect.quantity,
      resolution: body.resolution || null,
    })
    .eq("id", id);

  if (updateDefectError) {
    return NextResponse.json(
      { error: "Failed to resolve defect", details: updateDefectError.message },
      { status: 500 }
    );
  }

  // 3. Check if lot has other pending defects
  const { count: pendingCount } = await supabase
    .from("defect_records")
    .select("id", { count: "exact", head: true })
    .eq("lot_id", defect.lot_id)
    .eq("status", "PENDING")
    .neq("id", id);

  // Only restore lot status if no other pending defects
  if ((pendingCount ?? 0) === 0 && defect.previous_stage_id) {
    // Get stage name to determine lot status
    const { data: stage } = await supabase
      .from("stages")
      .select("name")
      .eq("id", defect.previous_stage_id)
      .single();

    const newStatus = stage ? (STAGE_STATUS_MAP[stage.name] || "CREATED") : "CREATED";

    await supabase
      .from("lots")
      .update({
        status: newStatus,
        current_stage_id: defect.previous_stage_id,
      })
      .eq("id", defect.lot_id);
  }

  return NextResponse.json({
    message: "Defect resolved",
    lot_restored: (pendingCount ?? 0) === 0,
  });
}

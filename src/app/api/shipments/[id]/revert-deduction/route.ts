import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";

/**
 * POST /api/shipments/[id]/revert-deduction — Revert deduction after contest won
 * Story 8.9 — AC6
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;

  if (!can(user, "factions:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  let body: { reason?: string; amount?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Fetch current shipment
  const { data: shipment, error: fetchError } = await supabase
    .from("faction_shipments")
    .select("deduction_value, metadata")
    .eq("id", id)
    .single();

  if (fetchError || !shipment) {
    return NextResponse.json({ error: "Shipment not found" }, { status: 404 });
  }

  const currentDeduction = Number(shipment.deduction_value || 0);
  const revertAmount = body.amount ?? currentDeduction;

  if (revertAmount <= 0) {
    return NextResponse.json({ error: "Nothing to revert" }, { status: 400 });
  }

  // Build metadata adjustments history
  const metadata = (shipment.metadata as Record<string, unknown>) || {};
  const adjustments = Array.isArray(metadata.adjustments) ? metadata.adjustments : [];
  adjustments.push({
    date: new Date().toISOString(),
    type: "DEDUCTION_REVERT",
    amount: revertAmount,
    reason: body.reason || "Contestação aceita",
    revertedBy: user.id,
  });

  const newDeduction = Math.max(0, currentDeduction - revertAmount);

  const { error } = await supabase
    .from("faction_shipments")
    .update({
      deduction_value: newDeduction,
      metadata: { ...metadata, adjustments },
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data: {
      previousDeduction: currentDeduction,
      newDeduction,
      revertedAmount: revertAmount,
    },
  });
}

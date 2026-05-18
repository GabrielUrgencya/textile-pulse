import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateFactionSession } from "@/lib/faction-middleware";

/**
 * GET /api/faction/summary
 * AC1: Returns faction summary — total pieces, next deadline, amount receivable, general status.
 */
export async function GET() {
  const session = await validateFactionSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const [shipmentsResult, defectsResult] = await Promise.all([
    // Active shipments (not fully returned)
    supabase
      .from("faction_shipments")
      .select("id, quantity_sent, quantity_returned, expected_return_at, status, payment_value, deduction_value, faction_confirmed_at")
      .eq("faction_id", session.factionId)
      .neq("status", "RETURNED"),

    // Pending defects (no faction response yet)
    supabase
      .from("defect_records")
      .select("id, faction_shipments!inner(faction_id)", { count: "exact", head: true })
      .eq("faction_shipments.faction_id", session.factionId)
      .is("faction_response", null),
  ]);

  const active = shipmentsResult.data || [];

  const totalPieces = active.reduce(
    (sum, s) => sum + (s.quantity_sent - s.quantity_returned),
    0
  );

  const nextDeadline = active
    .filter((s) => s.expected_return_at)
    .sort((a, b) =>
      new Date(a.expected_return_at).getTime() - new Date(b.expected_return_at).getTime()
    )[0]?.expected_return_at || null;

  const pendingConfirmation = active.filter(
    (s) => s.status === "SENT" && !s.faction_confirmed_at
  ).length;

  const amountReceivable = active.reduce(
    (sum, s) => sum + (Number(s.payment_value || 0) - Number(s.deduction_value || 0)),
    0
  );

  return NextResponse.json({
    totalPieces,
    nextDeadline,
    amountReceivable: Math.round(amountReceivable * 100) / 100,
    pendingConfirmation,
    pendingDefects: defectsResult.count ?? 0,
    activeShipments: active.length,
  });
}

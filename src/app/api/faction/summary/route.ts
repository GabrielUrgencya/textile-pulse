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

  const now = new Date().toISOString();

  const [shipmentsResult, defectsResult, notificationsResult] = await Promise.all([
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

    // Unread notifications
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("faction_id", session.factionId)
      .eq("read", false),
  ]);

  const active = shipmentsResult.data || [];

  const totalPiecesWithFaction = active.reduce(
    (sum, s) => sum + ((s.quantity_sent || 0) - (s.quantity_returned || 0)),
    0
  );

  const nextDeadline = active
    .filter((s) => s.expected_return_at)
    .sort((a, b) =>
      new Date(a.expected_return_at).getTime() - new Date(b.expected_return_at).getTime()
    )[0]?.expected_return_at || null;

  // Shipments awaiting faction confirmation
  const pendingConfirmationShipments = active.filter(
    (s) => s.status === "SENT" && !s.faction_confirmed_at
  );

  // Pending returns: shipments with status SENT or PENDING (not yet returned)
  const pendingReturns = active.filter(
    (s) => s.status === "SENT" || s.status === "PENDING"
  ).length;

  // Overdue: past expected_return_at and not returned
  const overdueCount = active.filter(
    (s) => s.expected_return_at && new Date(s.expected_return_at).toISOString() < now && s.status !== "RECEIVED"
  ).length;

  const currentPeriodValue = active.reduce(
    (sum, s) => sum + (Number(s.payment_value || 0) - Number(s.deduction_value || 0)),
    0
  );

  return NextResponse.json({
    factionName: session.factionName,
    totalPiecesWithFaction,
    pendingReturns,
    pendingDefects: defectsResult.count ?? 0,
    currentPeriodValue: Math.round(currentPeriodValue * 100) / 100,
    nextDeadline,
    overdueCount,
    unreadNotifications: notificationsResult.count ?? 0,
    pendingConfirmation: pendingConfirmationShipments.length > 0,
    pendingShipmentId: pendingConfirmationShipments[0]?.id || null,
  });
}

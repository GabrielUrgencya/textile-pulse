import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateFactionSession } from "@/lib/faction-middleware";

/**
 * GET /api/faction/financial/[period]
 * AC7: Returns details of a specific financial period (e.g., 2026-05).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ period: string }> }
) {
  const session = await validateFactionSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { period } = await params;

  // Validate period format YYYY-MM
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return NextResponse.json({ error: "Invalid period format. Use YYYY-MM" }, { status: 400 });
  }

  const [year, month] = period.split("-").map(Number);
  const startDate = new Date(year, month - 1, 1).toISOString();
  const endDate = new Date(year, month, 0, 23, 59, 59, 999).toISOString();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from("faction_shipments")
    .select(
      "id, quantity_sent, quantity_returned, quantity_defective, payment_value, deduction_value, status, sent_at, actual_return_at, notes, lots!inner(barcode, lot_number, production_orders!inner(op_number, product_name))"
    )
    .eq("faction_id", session.factionId)
    .gte("sent_at", startDate)
    .lte("sent_at", endDate)
    .order("sent_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch period data" }, { status: 500 });
  }

  const shipments = data || [];

  const totalPayment = shipments.reduce((sum, s) => sum + Number(s.payment_value || 0), 0);
  const totalDeduction = shipments.reduce((sum, s) => sum + Number(s.deduction_value || 0), 0);
  const totalPieces = shipments.reduce((sum, s) => sum + (s.quantity_returned || 0), 0);

  return NextResponse.json({
    period,
    summary: {
      totalPayment: Math.round(totalPayment * 100) / 100,
      totalDeduction: Math.round(totalDeduction * 100) / 100,
      netAmount: Math.round((totalPayment - totalDeduction) * 100) / 100,
      shipmentCount: shipments.length,
      totalPieces,
    },
    shipments,
  });
}

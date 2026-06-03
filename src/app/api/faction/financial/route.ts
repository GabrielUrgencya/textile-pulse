import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateFactionSession } from "@/lib/faction-middleware";
import { dbError } from "@/lib/api-helpers";

/**
 * GET /api/faction/financial
 * AC6: Returns open financial period + history grouped by month/year.
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

  // All shipments for this faction with financial data
  const { data: shipments, error } = await supabase
    .from("faction_shipments")
    .select("id, quantity_sent, quantity_returned, quantity_defective, payment_value, deduction_value, status, sent_at, actual_return_at")
    .eq("faction_id", session.factionId)
    .order("sent_at", { ascending: false });

  if (error) return dbError("GET /api/faction/financial", error);

  // Group by month/year period
  const periods = new Map<string, {
    period: string;
    totalPayment: number;
    totalDeduction: number;
    netAmount: number;
    shipmentCount: number;
    piecesProcessed: number;
    isOpen: boolean;
  }>();

  for (const s of shipments || []) {
    const date = new Date(s.sent_at);
    const period = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const isOpen = s.status !== "RETURNED";
    const payment = Number(s.payment_value || 0);
    const deduction = Number(s.deduction_value || 0);

    const existing = periods.get(period);
    if (existing) {
      existing.totalPayment += payment;
      existing.totalDeduction += deduction;
      existing.netAmount += payment - deduction;
      existing.shipmentCount++;
      existing.piecesProcessed += s.quantity_returned || 0;
      if (isOpen) existing.isOpen = true;
    } else {
      periods.set(period, {
        period,
        totalPayment: payment,
        totalDeduction: deduction,
        netAmount: payment - deduction,
        shipmentCount: 1,
        piecesProcessed: s.quantity_returned || 0,
        isOpen,
      });
    }
  }

  const allPeriods = Array.from(periods.values())
    .sort((a, b) => b.period.localeCompare(a.period))
    .map((p) => ({
      ...p,
      totalPayment: Math.round(p.totalPayment * 100) / 100,
      totalDeduction: Math.round(p.totalDeduction * 100) / 100,
      netAmount: Math.round(p.netAmount * 100) / 100,
    }));

  const openPeriod = allPeriods.find((p) => p.isOpen) || null;
  const history = allPeriods.filter((p) => !p.isOpen);

  return NextResponse.json({ openPeriod, history });
}

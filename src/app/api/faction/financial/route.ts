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
    .select("id, quantity_sent, quantity_returned, quantity_defective, payment_value, deduction_value, released_value, retained_value, payment_status, status, sent_at, actual_return_at")
    .eq("faction_id", session.factionId)
    .order("sent_at", { ascending: false });

  if (error) return dbError("GET /api/faction/financial", error);

  // Group by month/year period
  const periods = new Map<string, {
    period: string;
    totalPayment: number;
    totalDeduction: number;
    totalReleased: number;
    totalRetained: number;
    totalPaid: number;
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
    const released = Number(s.released_value || 0);
    const retained = Number(s.retained_value || 0);
    const paid = s.payment_status === "PAID" ? released : 0;

    const existing = periods.get(period);
    if (existing) {
      existing.totalPayment += payment;
      existing.totalDeduction += deduction;
      existing.totalReleased += released;
      existing.totalRetained += retained;
      existing.totalPaid += paid;
      existing.netAmount += released; // valor real a receber = liberado
      existing.shipmentCount++;
      existing.piecesProcessed += s.quantity_returned || 0;
      if (isOpen) existing.isOpen = true;
    } else {
      periods.set(period, {
        period,
        totalPayment: payment,
        totalDeduction: deduction,
        totalReleased: released,
        totalRetained: retained,
        totalPaid: paid,
        netAmount: released,
        shipmentCount: 1,
        piecesProcessed: s.quantity_returned || 0,
        isOpen,
      });
    }
  }

  const r2 = (x: number) => Math.round(x * 100) / 100;
  const allPeriods = Array.from(periods.values())
    .sort((a, b) => b.period.localeCompare(a.period))
    .map((p) => ({
      ...p,
      totalPayment: r2(p.totalPayment),
      totalDeduction: r2(p.totalDeduction),
      totalReleased: r2(p.totalReleased),
      totalRetained: r2(p.totalRetained),
      totalPaid: r2(p.totalPaid),
      netAmount: r2(p.netAmount),
    }));

  const openPeriod = allPeriods.find((p) => p.isOpen) || null;
  const history = allPeriods.filter((p) => !p.isOpen);

  // Saldo corrente do ledger de compensação (fonte do display semântico).
  const { data: factionRow } = await supabase
    .from("factions")
    .select("current_balance")
    .eq("id", session.factionId)
    .single();
  const currentBalance = r2(Number(factionRow?.current_balance || 0));

  return NextResponse.json({ openPeriod, history, currentBalance });
}

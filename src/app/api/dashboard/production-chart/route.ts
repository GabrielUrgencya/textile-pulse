import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { computeChartData } from "@/lib/kpi-queries";

export async function GET(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase } = auth;

  const { searchParams } = new URL(request.url);

  // AC6: Date range filter — defaults to last 7 days
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const from = searchParams.get("from") || sevenDaysAgo.toISOString().slice(0, 10);
  const to = searchParams.get("to") || today.toISOString().slice(0, 10);

  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(from) || !dateRegex.test(to)) {
    return NextResponse.json(
      { error: "Invalid date format. Use YYYY-MM-DD" },
      { status: 400 }
    );
  }

  if (from > to) {
    return NextResponse.json(
      { error: "'from' date must be before or equal to 'to' date" },
      { status: 400 }
    );
  }

  // Group by hour if range is 1 day, otherwise by day
  const groupBy = from === to ? "hour" : "day";

  try {
    const chart = await computeChartData(supabase, { from, to }, groupBy);

    return NextResponse.json({
      chart,
      period: { from, to },
      group_by: groupBy,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to compute chart data", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

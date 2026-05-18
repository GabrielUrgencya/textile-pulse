import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { computeKpis } from "@/lib/kpi-queries";

export async function GET(request: Request) {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);

  // AC6: Date range filter — defaults to today
  const today = new Date().toISOString().slice(0, 10);
  const from = searchParams.get("from") || today;
  const to = searchParams.get("to") || today;

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

  try {
    const kpis = await computeKpis(supabase, { from, to });

    return NextResponse.json({
      kpis,
      period: { from, to },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to compute KPIs", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

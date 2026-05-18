import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateFactionSession } from "@/lib/faction-middleware";

/**
 * GET /api/faction/returns?page=1&limit=20
 * AC4: Returns pending returns ordered by urgency (expected_return_at ASC).
 */
export async function GET(request: Request) {
  const session = await validateFactionSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20")));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, count, error } = await supabase
    .from("faction_shipments")
    .select(
      "id, lot_id, quantity_sent, quantity_returned, expected_return_at, status, faction_estimated_return, reschedule_count, last_rescheduled_at, lots!inner(barcode, lot_number, production_orders!inner(op_number, product_name))",
      { count: "exact" }
    )
    .eq("faction_id", session.factionId)
    .in("status", ["SENT", "RECEIVED_BY_FACTION", "PARTIALLY_RETURNED", "OVERDUE"])
    .order("expected_return_at", { ascending: true })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: "Failed to fetch returns" }, { status: 500 });
  }

  return NextResponse.json({
    data: data || [],
    pagination: {
      page,
      limit,
      total: count ?? 0,
      totalPages: Math.ceil((count ?? 0) / limit),
    },
  });
}

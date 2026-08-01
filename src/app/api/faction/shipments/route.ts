import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateFactionSession } from "@/lib/faction-middleware";
import { dbError } from "@/lib/api-helpers";
import { PORTAL_ACTIVE_STATUSES } from "@/lib/shipment-status";

/**
 * GET /api/faction/shipments?page=1&limit=20
 * AC2: Returns shipments for this faction (status != RETURNED), with pagination.
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

  // F2: ativas = posse/pendência da facção; histórico = RETURNED + CLOSED
  // (encerradas ficam consultáveis com o resumo financeiro).
  const view = searchParams.get("view");

  let query = supabase
    .from("faction_shipments")
    .select(
      "id, lot_id, shipment_group_id, quantity_sent, quantity_returned, quantity_defective, sent_at, expected_return_at, actual_return_at, status, payment_value, deduction_value, released_value, retained_value, payment_status, closed_at, notes, faction_confirmed_at, faction_estimated_return, reschedule_count, lots!inner(barcode, lot_number, production_orders!inner(op_number, product_name))",
      { count: "exact" }
    )
    .eq("faction_id", session.factionId)
    .order("sent_at", { ascending: false })
    .range(from, to);

  query =
    view === "history"
      ? query.in("status", ["RETURNED", "CLOSED"])
      // Ativas = o que a facção ainda tem em mãos. Usa a fonte de verdade (o
      // PORTAL_ACTIVE_STATUSES foi criado exatamente para este filtro) em vez de
      // lista à mão, para não divergir se surgir um status novo.
      : query.in("status", [...PORTAL_ACTIVE_STATUSES]);

  const { data, count, error } = await query;

  if (error) return dbError("GET /api/faction/shipments", error);

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

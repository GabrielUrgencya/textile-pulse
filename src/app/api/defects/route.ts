import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";

const VALID_DEFECT_TYPES = ["COSTURA", "TECIDO", "AVIAMENTO", "OUTRO"] as const;
const VALID_SEVERITIES = ["LEVE", "MEDIO", "GRAVE"] as const;

export async function POST(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  if (!can(user, "rework:report")) {
    return NextResponse.json({ error: "Forbidden: rework:report required" }, { status: 403 });
  }

  let body: {
    lot_id?: string;
    defect_type?: string;
    severity?: string;
    quantity?: number;
    description?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { lot_id, defect_type, severity, quantity, description } = body;

  if (!lot_id || !defect_type || !severity) {
    return NextResponse.json(
      { error: "lot_id, defect_type, and severity are required" },
      { status: 400 }
    );
  }

  if (!VALID_DEFECT_TYPES.includes(defect_type as typeof VALID_DEFECT_TYPES[number])) {
    return NextResponse.json(
      { error: `Invalid defect_type. Must be one of: ${VALID_DEFECT_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  if (!VALID_SEVERITIES.includes(severity as typeof VALID_SEVERITIES[number])) {
    return NextResponse.json(
      { error: `Invalid severity. Must be one of: ${VALID_SEVERITIES.join(", ")}` },
      { status: 400 }
    );
  }

  const qty = quantity ?? 1;
  if (qty < 1) {
    return NextResponse.json({ error: "quantity must be >= 1" }, { status: 400 });
  }

  // 1. Fetch the lot to get current_stage_id
  const { data: lot, error: lotError } = await supabase
    .from("lots")
    .select("id, current_stage_id, status")
    .eq("id", lot_id)
    .single();

  if (lotError || !lot) {
    return NextResponse.json({ error: "Lot not found" }, { status: 404 });
  }

  // 2. Insert defect_record
  const { data: defect, error: insertError } = await supabase
    .from("defect_records")
    .insert({
      lot_id,
      defect_type,
      severity,
      quantity: qty,
      description: description || null,
      detected_by: user.id,
      status: "PENDING",
    })
    .select("id, lot_id, defect_type, severity, quantity, description, detected_at, status")
    .single();

  if (insertError) {
    return NextResponse.json(
      { error: "Failed to create defect record", details: insertError.message },
      { status: 500 }
    );
  }

  // 3. Update lot status to IN_REWORK
  const { error: updateError } = await supabase
    .from("lots")
    .update({ status: "IN_REWORK" })
    .eq("id", lot_id);

  if (updateError) {
    return NextResponse.json(
      { error: "Defect recorded but failed to update lot status", details: updateError.message },
      { status: 500 }
    );
  }

  // 4. Story 8.3: Auto-notification when defect on AT_FACTION lot
  if (lot.status === "AT_FACTION") {
    try {
      // Find the active shipment for this lot
      const { data: shipment } = await supabase
        .from("faction_shipments")
        .select("id, faction_id, factions!inner(tenant_id)")
        .eq("lot_id", lot_id)
        .in("status", ["SENT", "RECEIVED_BY_FACTION"])
        .limit(1)
        .single();

      if (shipment) {
        const factionRel = shipment.factions as unknown;
        const faction = (Array.isArray(factionRel) ? factionRel[0] : factionRel) as { tenant_id: string } | null;
        const tenantId = faction?.tenant_id;

        if (tenantId) {
          // Deduplication: check for existing notification in last 4 hours (REGRA 5)
          const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
          const { data: existing } = await supabase
            .from("notifications")
            .select("id")
            .eq("tenant_id", tenantId)
            .eq("type", "DEFECT_DETECTED")
            .eq("faction_id", shipment.faction_id)
            .is("read_at", null)
            .gte("created_at", fourHoursAgo)
            .limit(1);

          if (!existing || existing.length === 0) {
            const notifSeverity = severity === "GRAVE" ? "CRITICAL" : "WARNING";
            await supabase.from("notifications").insert({
              tenant_id: tenantId,
              faction_id: shipment.faction_id,
              type: "DEFECT_DETECTED",
              title: `Defeito detectado — Lote ${lot_id.slice(0, 8)}`,
              message: `${qty} peça(s) com defeito de ${defect_type}. Severidade: ${severity}.`,
              severity: notifSeverity,
            });
          }
        }
      }
    } catch {
      // Non-blocking: notification failure should not affect defect creation
    }
  }

  return NextResponse.json({ defect, lot_status: "IN_REWORK" }, { status: 201 });
}

export async function GET(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase } = auth;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const defectType = searchParams.get("defect_type");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  let query = supabase
    .from("defect_records")
    .select(`
      id, lot_id, defect_type, severity, quantity, description,
      detected_at, resolved_at, status,
      detected_by, resolved_by,
      lots (
        id, barcode, lot_number, po_id,
        production_orders ( id, op_number, product_name )
      )
    `, { count: "exact" })
    .order("detected_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq("status", status);
  }
  if (defectType) {
    query = query.eq("defect_type", defectType);
  }
  if (from) {
    query = query.gte("detected_at", `${from}T00:00:00`);
  }
  if (to) {
    query = query.lte("detected_at", `${to}T23:59:59`);
  }

  const { data: defects, error, count } = await query;

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch defects", details: error.message },
      { status: 500 }
    );
  }

  // Report data: group by type and by OP
  let reportQuery = supabase
    .from("defect_records")
    .select("defect_type, quantity, lot_id, lots ( po_id, production_orders ( op_number ) )");

  if (status) reportQuery = reportQuery.eq("status", status);
  if (defectType) reportQuery = reportQuery.eq("defect_type", defectType);
  if (from) reportQuery = reportQuery.gte("detected_at", `${from}T00:00:00`);
  if (to) reportQuery = reportQuery.lte("detected_at", `${to}T23:59:59`);

  // Aggregate counts for KPIs (independent of pagination)
  let pendingCountQuery = supabase
    .from("defect_records")
    .select("id", { count: "exact", head: true })
    .eq("status", "PENDING");

  let resolvedCountQuery = supabase
    .from("defect_records")
    .select("id", { count: "exact", head: true })
    .eq("status", "RESOLVED");

  // Apply same filters (except status) to count queries
  if (defectType) {
    pendingCountQuery = pendingCountQuery.eq("defect_type", defectType);
    resolvedCountQuery = resolvedCountQuery.eq("defect_type", defectType);
  }
  if (from) {
    pendingCountQuery = pendingCountQuery.gte("detected_at", `${from}T00:00:00`);
    resolvedCountQuery = resolvedCountQuery.gte("detected_at", `${from}T00:00:00`);
  }
  if (to) {
    pendingCountQuery = pendingCountQuery.lte("detected_at", `${to}T23:59:59`);
    resolvedCountQuery = resolvedCountQuery.lte("detected_at", `${to}T23:59:59`);
  }

  const [{ data: reportData }, { count: pendingCount }, { count: resolvedCount }] = await Promise.all([
    reportQuery,
    pendingCountQuery,
    resolvedCountQuery,
  ]);

  const byType: Record<string, { count: number; quantity: number }> = {};
  const byOp: Record<string, { count: number; quantity: number }> = {};

  if (reportData) {
    for (const r of reportData) {
      const t = r.defect_type;
      if (!byType[t]) byType[t] = { count: 0, quantity: 0 };
      byType[t].count++;
      byType[t].quantity += r.quantity;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lot = r.lots as any;
      const op = lot?.production_orders?.op_number as string | undefined;
      if (op) {
        if (!byOp[op]) byOp[op] = { count: 0, quantity: 0 };
        byOp[op].count++;
        byOp[op].quantity += r.quantity;
      }
    }
  }

  const totalDefects = (pendingCount ?? 0) + (resolvedCount ?? 0);

  return NextResponse.json({
    defects,
    total: count ?? 0,
    pending_count: pendingCount ?? 0,
    resolved_count: resolvedCount ?? 0,
    total_defects: totalDefects,
    report: { by_type: byType, by_op: byOp },
  });
}

import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { dbError, requireTenantId } from "@/lib/api-helpers";
import { can } from "@/lib/effective-permissions";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  const { id } = params;

  // Phase 1: Fetch order, lots, and ESTOQUE stage in parallel
  const [orderResult, lotsResult, stageResult] = await Promise.all([
    supabase
      .from("production_orders")
      .select("*")
      .eq("id", id)
      .single(),
    supabase
      .from("lots")
      .select("id, barcode, lot_number, quantity, current_stage_id, status, color, size_grid, destination, created_at")
      .eq("po_id", id)
      .order("lot_number", { ascending: true }),
    supabase
      .from("stages")
      .select("id")
      .eq("name", "ESTOQUE")
      .single(),
  ]);

  if (orderResult.error || !orderResult.data) {
    return NextResponse.json(
      { error: "Production order not found" },
      { status: 404 }
    );
  }

  const order = orderResult.data;
  const lots = lotsResult.data || [];

  let produced = 0;
  let stocked = 0;
  let defect = 0;
  let discarded = 0;

  if (lots.length > 0) {
    const lotIds = lots.map((l) => l.id);

    // Phase 2: Fetch scan_events and defect_records in parallel
    const [scanResult, defectResult] = await Promise.all([
      stageResult.data
        ? supabase
            .from("scan_events")
            .select("id", { count: "exact", head: true })
            .in("lot_id", lotIds)
            .eq("stage_id", stageResult.data.id)
            .eq("event_type", "STAGE_IN")
        : Promise.resolve({ count: 0 }),
      supabase
        .from("defect_records")
        .select("quantity, discarded_quantity")
        .in("lot_id", lotIds),
    ]);

    produced = ("count" in scanResult ? scanResult.count : 0) || 0;
    stocked = lots.filter((l) => l.status === "IN_STOCK").length;

    if ("data" in defectResult && defectResult.data) {
      for (const d of defectResult.data) {
        defect += d.quantity || 0;
        discarded += d.discarded_quantity || 0;
      }
    }
  }

  return NextResponse.json({
    order,
    lots,
    computed_quantities: {
      produced,
      stocked,
      defect,
      discarded,
    },
    user_role: (user.app_metadata?.role as string) || null,
  });
}

/**
 * Story 8.16 — Cancelamento/Arquivamento de OP (soft delete).
 * Seta status='CANCELLED' e registra em audit_log. NAO apaga fisicamente.
 */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  if (!can(user, "orders:delete")) {
    return NextResponse.json(
      { error: "Forbidden: orders:delete required" },
      { status: 403 }
    );
  }

  const t = requireTenantId(user);
  if (t.error) return t.error;

  const { id } = params;
  const body = await request.json().catch(() => null);
  const reason = body?.reason?.toString().trim() || null;

  // Confirma que a OP existe e pertence ao tenant
  const { data: order, error: fetchError } = await supabase
    .from("production_orders")
    .select("id, op_number, status, tenant_id")
    .eq("id", id)
    .eq("tenant_id", t.tenantId)
    .single();

  if (fetchError || !order) {
    return NextResponse.json({ error: "Production order not found" }, { status: 404 });
  }

  if (order.status === "CANCELLED") {
    return NextResponse.json({ error: "OP já está cancelada" }, { status: 409 });
  }

  const { error: updateError } = await supabase
    .from("production_orders")
    .update({ status: "CANCELLED" })
    .eq("id", id)
    .eq("tenant_id", t.tenantId);

  if (updateError) return dbError("DELETE /api/production/orders/[id]", updateError);

  // Audit trail (nao bloqueante)
  await supabase.from("audit_log").insert({
    tenant_id: t.tenantId,
    user_id: user.id,
    action: "CANCEL_OP",
    entity_type: "production_order",
    entity_id: id,
    details: { op_number: order.op_number, reason },
  });

  return NextResponse.json({ data: { success: true, status: "CANCELLED" } });
}

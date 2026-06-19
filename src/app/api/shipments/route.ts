import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";
import { dbError, requireTenantId } from "@/lib/api-helpers";
import { generateUniqueDeliveryCode } from "@/lib/delivery-code";

export async function GET(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;

  if (!can(user, "factions:view")) {
    return NextResponse.json({ error: "Forbidden: factions:view required" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const factionId = searchParams.get("faction_id");
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("faction_shipments")
    .select(`
      id, faction_id, status, quantity_sent, quantity_returned, quantity_defective,
      sent_at, actual_return_at, expected_return_at, payment_value, deduction_value,
      notes, created_at,
      factions ( id, name )
    `, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status) query = query.eq("status", status);
  if (factionId) query = query.eq("faction_id", factionId);

  const { data: shipments, error, count } = await query;

  if (error) return dbError("GET /api/shipments", error);

  // Story 8.14 (AC8): dias restantes / atraso ate o prazo de retorno da faccao
  const MS_PER_DAY = 86_400_000;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const enriched = (shipments || []).map((s) => {
    const rec = s as Record<string, unknown>;
    const expected = rec.expected_return_at as string | null;
    const settled = rec.actual_return_at != null;
    let daysRemaining: number | null = null;
    let isOverdue = false;
    if (expected && !settled) {
      const due = new Date(expected);
      due.setHours(0, 0, 0, 0);
      daysRemaining = Math.round((due.getTime() - startOfToday.getTime()) / MS_PER_DAY);
      isOverdue = daysRemaining < 0;
    }
    return { ...s, days_remaining: daysRemaining, is_overdue: isOverdue };
  });

  return NextResponse.json({
    data: enriched,
    pagination: {
      page,
      limit,
      total: count || 0,
      pages: Math.ceil((count || 0) / limit),
    },
  });
}

export async function POST(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;

  if (!can(user, "factions:manage")) {
    return NextResponse.json({ error: "Forbidden: factions:manage required" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);

  if (!body?.factionId || !body?.lotIds?.length || !body?.expectedReturn) {
    return NextResponse.json(
      { error: "factionId, lotIds, and expectedReturn are required" },
      { status: 400 },
    );
  }

  const t = requireTenantId(user);
  if (t.error) return t.error;

  // Get lot quantities
  const { data: lots } = await supabase
    .from("lots")
    .select("id, quantity")
    .in("id", body.lotIds);

  const totalQuantity = lots?.reduce((sum, l) => sum + (l.quantity || 0), 0) || 0;

  // Story 8.2: Generate delivery code
  let deliveryCode: string | null = null;
  let deliveryCodeExpiresAt: string | null = null;
  try {
    const dc = await generateUniqueDeliveryCode(supabase);
    deliveryCode = dc.code;
    deliveryCodeExpiresAt = dc.expiresAt;
  } catch {
    // Non-blocking: shipment can proceed without delivery code
  }

  // Create shipment
  const { data: shipment, error } = await supabase
    .from("faction_shipments")
    .insert({
      tenant_id: t.tenantId,
      faction_id: body.factionId,
      status: "SENT",
      total_quantity: totalQuantity,
      sent_at: new Date().toISOString(),
      expected_return: body.expectedReturn,
      notes: body.notes || null,
      delivery_code: deliveryCode,
      delivery_code_expires_at: deliveryCodeExpiresAt,
    })
    .select("id, delivery_code, delivery_code_expires_at")
    .single();

  if (error) return dbError("POST /api/shipments", error);

  // Link lots to shipment
  if (shipment && lots) {
    const shipmentLots = lots.map((lot) => ({
      shipment_id: shipment.id,
      lot_id: lot.id,
      quantity: lot.quantity || 0,
    }));

    await supabase.from("shipment_lots").insert(shipmentLots);
  }

  return NextResponse.json({ data: shipment }, { status: 201 });
}

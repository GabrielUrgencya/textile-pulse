import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";
import { escapeLikePattern } from "@/lib/utils";

export async function GET(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;

  if (!can(user, "factions:view")) {
    return NextResponse.json({ error: "Forbidden: factions:view required" }, { status: 403 });
  }

  const url = new URL(request.url);
  const search = url.searchParams.get("search") || "";
  const active = url.searchParams.get("active") !== "false";

  let query = supabase
    .from("factions")
    .select("id, name, type, contact_name, contact_phone, rating, is_active, price_per_piece, avg_delivery_days, photo_url, created_at")
    .order("name", { ascending: true });

  if (active) {
    query = query.eq("is_active", true);
  }

  if (search) {
    query = query.ilike("name", `%${escapeLikePattern(search)}%`);
  }

  const { data: factions, error } = await query;

  if (error) {
    console.error("[GET /api/factions] Supabase error:", error.message, error.code);
    return NextResponse.json({ error: error.message || "Failed to fetch factions" }, { status: 500 });
  }

  // Get aggregate KPIs
  const { data: activeShipments } = await supabase
    .from("faction_shipments")
    .select("id, status, total_quantity, faction_id")
    .in("status", ["PENDING", "SENT"]);

  const totalActive = factions?.filter((f) => f.is_active).length || 0;
  const shipmentsInProgress = activeShipments?.length || 0;

  // C3 FIX: Calculate real avgDefectRate
  // Get all shipments to compute total pieces sent
  const { data: allShipments } = await supabase
    .from("faction_shipments")
    .select("id, total_quantity");

  const totalPiecesSent = (allShipments || []).reduce((sum, s) => sum + (s.total_quantity || 0), 0);

  // Get total defect count linked to shipped lots
  const allShipmentIds = (allShipments || []).map((s) => s.id);
  let totalDefects = 0;

  if (allShipmentIds.length > 0) {
    const { data: shipmentLots } = await supabase
      .from("shipment_lots")
      .select("lot_id")
      .in("shipment_id", allShipmentIds);

    const lotIds = (shipmentLots || []).map((sl) => sl.lot_id);

    if (lotIds.length > 0) {
      const { count } = await supabase
        .from("defect_records")
        .select("id", { count: "exact", head: true })
        .in("lot_id", lotIds);

      totalDefects = count || 0;
    }
  }

  const avgDefectRate = totalPiecesSent > 0
    ? Math.round((totalDefects / totalPiecesSent) * 10000) / 100
    : 0;

  // C3 FIX: Calculate real totalPendingValue
  // Pending value = sum of pieces * price_per_piece for non-RETURNED shipments
  const activeFactions = factions || [];
  const factionPriceMap = new Map(
    activeFactions.map((f) => [f.id, Number(f.price_per_piece) || 0]),
  );

  const pendingShipments = (activeShipments || []).filter((s) =>
    ["PENDING", "SENT"].includes(s.status),
  );

  const totalPendingValue = pendingShipments.reduce((sum, s) => {
    const price = factionPriceMap.get(s.faction_id) || 0;
    return sum + (s.total_quantity || 0) * price;
  }, 0);

  return NextResponse.json({
    data: {
      factions: factions || [],
      kpis: {
        totalActive,
        shipmentsInProgress,
        avgDefectRate,
        totalPendingValue,
      },
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

  if (!body?.name || !body?.type) {
    return NextResponse.json({ error: "name and type are required" }, { status: 400 });
  }

  const tenantId = user.app_metadata?.tenant_id;

  if (!tenantId) {
    return NextResponse.json(
      { error: "Tenant não configurado para este usuário" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("factions")
    .insert({
      tenant_id: tenantId,
      name: body.name,
      type: body.type,
      contact_name: body.contactName || null,
      contact_phone: body.contactPhone || null,
      address: body.address || null,
      price_per_piece: body.pricePerPiece || null,
      avg_delivery_days: body.avgDeliveryDays || 7,
      photo_url: body.photoUrl || null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[POST /api/factions] Supabase error:", error.message, error.code);
    return NextResponse.json(
      { error: error.message || "Failed to create faction" },
      { status: 500 },
    );
  }

  return NextResponse.json({ data }, { status: 201 });
}

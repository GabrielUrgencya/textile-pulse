import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { hasPermission, type AppRole } from "@/lib/permissions";
import { dbError } from "@/lib/api-helpers";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;
  const role = user.app_metadata?.role;

  if (!hasPermission(role as AppRole, "factions:view")) {
    return NextResponse.json({ error: "Forbidden: factions:view required" }, { status: 403 });
  }

  const { id } = await params;

  const { data: faction, error } = await supabase
    .from("factions")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !faction) {
    return NextResponse.json({ error: "Faction not found" }, { status: 404 });
  }

  // Get recent shipments
  const { data: shipments } = await supabase
    .from("faction_shipments")
    .select("*")
    .eq("faction_id", id)
    .order("sent_at", { ascending: false })
    .limit(20);

  // C1 FIX: Get defects filtered by faction — only defects linked to this faction's shipments
  const shipmentIds = (shipments || []).map((s) => s.id);
  let defects: Array<{ id: string; defect_type: string; severity: string; status: string; created_at: string }> = [];

  if (shipmentIds.length > 0) {
    // Get lot IDs associated with this faction's shipments via shipment_lots
    const { data: shipmentLots } = await supabase
      .from("shipment_lots")
      .select("lot_id")
      .in("shipment_id", shipmentIds);

    const lotIds = (shipmentLots || []).map((sl) => sl.lot_id);

    if (lotIds.length > 0) {
      const { data: factionDefects } = await supabase
        .from("defect_records")
        .select("id, defect_type, severity, status, created_at")
        .in("lot_id", lotIds)
        .order("created_at", { ascending: false })
        .limit(50);

      defects = factionDefects || [];
    }
  }

  // C2 FIX: Calculate financial from shipments and faction price
  const allShipments = shipments || [];
  const pricePerPiece = Number(faction.price_per_piece) || 0;
  const totalPieces = allShipments.reduce((sum, s) => sum + (s.total_quantity || 0), 0);
  const grossValue = totalPieces * pricePerPiece;
  // TODO: Implement deductions logic when payment/deduction table exists
  const deductions = 0;
  const netValue = grossValue - deductions;

  // UX1 FIX: Calculate delivery and quality scores
  const completedShipments = allShipments.filter((s) =>
    ["RECEIVED", "RETURNED"].includes(s.status),
  );
  const onTimeReturns = completedShipments.filter((s) => {
    if (!s.received_at || !s.expected_return) return false;
    return new Date(s.received_at) <= new Date(s.expected_return);
  });
  const deliveryScore = completedShipments.length > 0
    ? Math.round((onTimeReturns.length / completedShipments.length) * 100)
    : 0;
  const totalDefects = defects.length;
  const qualityScore = totalPieces > 0
    ? Math.round((1 - totalDefects / totalPieces) * 100)
    : 100;

  return NextResponse.json({
    data: {
      faction,
      shipments: allShipments,
      defects,
      financial: {
        grossValue,
        deductions,
        netValue,
      },
      scores: {
        deliveryScore,
        qualityScore,
        volumeTotal: totalPieces,
      },
    },
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;
  const role = user.app_metadata?.role;

  if (!hasPermission(role as AppRole, "factions:manage")) {
    return NextResponse.json({ error: "Forbidden: factions:manage required" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);

  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.type !== undefined) updates.type = body.type;
  if (body.contactName !== undefined) updates.contact_name = body.contactName;
  if (body.contactPhone !== undefined) updates.contact_phone = body.contactPhone;
  if (body.address !== undefined) updates.address = body.address;
  if (body.pricePerPiece !== undefined) updates.price_per_piece = body.pricePerPiece;
  if (body.avgDeliveryDays !== undefined) updates.avg_delivery_days = body.avgDeliveryDays;
  if (body.isActive !== undefined) updates.is_active = body.isActive;

  const { error } = await supabase
    .from("factions")
    .update(updates)
    .eq("id", id);

  if (error) return dbError("PATCH /api/factions/[id]", error);

  return NextResponse.json({ data: { success: true } });
}

import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { hasPermission, type AppRole } from "@/lib/permissions";
import { dbError, requireTenantId } from "@/lib/api-helpers";

export async function POST(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;
  const role = user.app_metadata?.role;

  if (!hasPermission(role as AppRole, "factions:manage")) {
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
    })
    .select("id")
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

import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";
import { generateUniqueDeliveryCode } from "@/lib/delivery-code";

/**
 * GET /api/shipments/[id]/delivery-code
 * Story 8.2 — AC2: Retrieve delivery code for a shipment (operator view)
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;

  if (!can(user, "factions:view")) {
    return NextResponse.json(
      { error: "Forbidden: factions:view required" },
      { status: 403 }
    );
  }

  const { id } = await params;

  const { data: shipment, error } = await supabase
    .from("faction_shipments")
    .select("id, delivery_code, delivery_code_expires_at, status")
    .eq("id", id)
    .single();

  if (error || !shipment) {
    return NextResponse.json({ error: "Shipment not found" }, { status: 404 });
  }

  const isExpired =
    shipment.delivery_code_expires_at &&
    new Date(shipment.delivery_code_expires_at) < new Date();

  return NextResponse.json({
    data: {
      deliveryCode: shipment.delivery_code,
      expiresAt: shipment.delivery_code_expires_at,
      expired: !!isExpired,
      status: shipment.status,
    },
  });
}

/**
 * POST /api/shipments/[id]/delivery-code
 * Story 8.2 — AC7: Regenerate delivery code (manager only)
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;

  if (!can(user, "factions:manage")) {
    return NextResponse.json(
      { error: "Forbidden: factions:manage required" },
      { status: 403 }
    );
  }

  const { id } = await params;

  const { data: shipment, error: fetchError } = await supabase
    .from("faction_shipments")
    .select("id, status")
    .eq("id", id)
    .single();

  if (fetchError || !shipment) {
    return NextResponse.json({ error: "Shipment not found" }, { status: 404 });
  }

  if (!["PREPARING", "SENT"].includes(shipment.status)) {
    return NextResponse.json(
      { error: "Cannot regenerate code for shipment with status: " + shipment.status },
      { status: 422 }
    );
  }

  const { code, expiresAt } = await generateUniqueDeliveryCode(supabase);

  const { error: updateError } = await supabase
    .from("faction_shipments")
    .update({
      delivery_code: code,
      delivery_code_expires_at: expiresAt,
      delivery_code_attempts: 0,
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to regenerate delivery code" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: {
      deliveryCode: code,
      expiresAt,
    },
  });
}

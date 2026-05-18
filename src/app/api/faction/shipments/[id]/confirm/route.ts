import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateFactionSession } from "@/lib/faction-middleware";

/**
 * PATCH /api/faction/shipments/[id]/confirm
 * Story 6.5 — AC1, AC10
 * Confirms shipment receipt: sets faction_confirmed_at and status to RECEIVED_BY_FACTION.
 */
export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await validateFactionSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Validate ownership + status
  const { data: shipment, error: fetchError } = await supabase
    .from("faction_shipments")
    .select("id, faction_id, status, faction_confirmed_at")
    .eq("id", id)
    .eq("faction_id", session.factionId)
    .single();

  if (fetchError || !shipment) {
    return NextResponse.json({ error: "Shipment not found" }, { status: 404 });
  }

  if (shipment.status !== "SENT") {
    return NextResponse.json(
      { error: "INVALID_STATUS", message: "Shipment must be in SENT status to confirm" },
      { status: 422 }
    );
  }

  if (shipment.faction_confirmed_at) {
    return NextResponse.json(
      { error: "ALREADY_CONFIRMED", message: "Shipment already confirmed" },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("faction_shipments")
    .update({
      faction_confirmed_at: now,
      status: "RECEIVED_BY_FACTION",
    })
    .eq("id", id)
    .eq("faction_id", session.factionId);

  if (updateError) {
    console.error("[faction/confirm] Update error:", updateError);
    return NextResponse.json({ error: "Failed to confirm shipment" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    shipmentId: id,
    confirmedAt: now,
    status: "RECEIVED_BY_FACTION",
  });
}

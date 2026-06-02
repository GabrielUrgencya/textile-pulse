import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { hasPermission, type AppRole } from "@/lib/permissions";

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

  if (!body || body.returnedQuantity === undefined) {
    return NextResponse.json({ error: "returnedQuantity is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("faction_shipments")
    .update({
      status: "RECEIVED",
      returned_quantity: body.returnedQuantity,
      received_at: new Date().toISOString(),
      notes: body.notes || null,
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "Failed to receive shipment" }, { status: 500 });
  }

  return NextResponse.json({ data: { success: true } });
}

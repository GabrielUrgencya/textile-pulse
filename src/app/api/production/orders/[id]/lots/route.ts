import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { hasPermission, type AppRole } from "@/lib/permissions";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase } = auth;

  const { id: poId } = params;

  const { data: lots, error } = await supabase
    .from("lots")
    .select("id, barcode, lot_number, quantity, quantity_defect, current_stage_id, status, destination, created_at")
    .eq("po_id", poId)
    .order("lot_number", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch lots", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: lots || [] });
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;
  const role = user.app_metadata?.role;

  if (!hasPermission(role as AppRole, "orders:create")) {
    return NextResponse.json({ error: "Forbidden: orders:create required" }, { status: 403 });
  }

  const { id: poId } = params;

  // Verify PO exists and get first stage in parallel
  const [orderResult, stageResult, lotCountResult] = await Promise.all([
    supabase
      .from("production_orders")
      .select("id, op_number")
      .eq("id", poId)
      .single(),
    supabase
      .from("stages")
      .select("id")
      .order("order_index", { ascending: true })
      .limit(1)
      .single(),
    supabase
      .from("lots")
      .select("id", { count: "exact", head: true })
      .eq("po_id", poId),
  ]);

  if (orderResult.error || !orderResult.data) {
    return NextResponse.json(
      { error: "Production order not found" },
      { status: 404 }
    );
  }

  const body = await request.json().catch(() => null);

  if (!body?.quantity || body.quantity < 1) {
    return NextResponse.json(
      { error: "quantity is required and must be >= 1" },
      { status: 400 }
    );
  }

  const order = orderResult.data;
  const lotSeq = (lotCountResult.count || 0) + 1;
  const barcode = `OP-${order.op_number}-L${String(lotSeq).padStart(3, "0")}`;
  const lotNumber = `L${String(lotSeq).padStart(3, "0")}`;

  const { data: lot, error: insertError } = await supabase
    .from("lots")
    .insert({
      po_id: poId,
      barcode,
      lot_number: lotNumber,
      quantity: body.quantity,
      current_stage_id: stageResult.data?.id || null,
      status: "CREATED",
      destination: body.destination || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (insertError) {
    if (insertError.message.includes("unique") || insertError.message.includes("duplicate")) {
      return NextResponse.json(
        { error: "Barcode already exists", barcode },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Failed to create lot", details: insertError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ lot, barcode }, { status: 201 });
}

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: poId } = params;

  // Verify PO exists (RLS filters by tenant)
  const { data: order, error: orderError } = await supabase
    .from("production_orders")
    .select("id, op_number")
    .eq("id", poId)
    .single();

  if (orderError || !order) {
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

  // Get the first stage (CORTE) as initial stage
  const { data: firstStage } = await supabase
    .from("stages")
    .select("id")
    .order("order_index", { ascending: true })
    .limit(1)
    .single();

  // Determine next lot sequence number
  const { count: existingLots } = await supabase
    .from("lots")
    .select("id", { count: "exact", head: true })
    .eq("po_id", poId);

  const lotSeq = (existingLots || 0) + 1;

  // AC7: Generate barcode in format OP-{op_number}-L{lot_seq}
  // op_number already contains the YYYYMMDD-seq part
  const barcode = `OP-${order.op_number}-L${String(lotSeq).padStart(3, "0")}`;
  const lotNumber = `L${String(lotSeq).padStart(3, "0")}`;

  const { data: lot, error: insertError } = await supabase
    .from("lots")
    .insert({
      po_id: poId,
      barcode,
      lot_number: lotNumber,
      quantity: body.quantity,
      current_stage_id: firstStage?.id || null,
      status: "CREATED",
      destination: body.destination || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (insertError) {
    // Check for unique constraint violation on barcode
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

import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";

/**
 * Story 8.25 — valida a grade de tamanhos (size_grid).
 * Aceita objeto { [tamanho]: quantidade } com inteiros >= 0.
 * Retorna { value: grade normalizada | null, sum, error? }.
 * Ausência de grade é válida (retrocompat) → value=null.
 */
function validateSizeGrid(raw: unknown): {
  value: Record<string, number> | null;
  sum: number;
  error?: string;
} {
  if (raw === undefined || raw === null) return { value: null, sum: 0 };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { value: null, sum: 0, error: "size_grid deve ser um objeto { tamanho: quantidade }" };
  }
  const entries = Object.entries(raw as Record<string, unknown>);
  const normalized: Record<string, number> = {};
  let sum = 0;
  for (const [size, qtyRaw] of entries) {
    const label = size.trim();
    if (!label) continue;
    const qty = Math.trunc(Number(qtyRaw));
    if (Number.isNaN(qty) || qty < 0) {
      return { value: null, sum: 0, error: `Quantidade inválida para o tamanho "${label}" (use inteiro >= 0)` };
    }
    if (qty === 0) continue; // omite tamanhos zerados da grade persistida
    normalized[label] = qty;
    sum += qty;
  }
  if (sum === 0) {
    return { value: null, sum: 0, error: "A grade de tamanhos não pode ser toda zerada" };
  }
  return { value: normalized, sum };
}

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
    .select("id, barcode, lot_number, quantity, quantity_defect, current_stage_id, status, destination, color, size_grid, created_at")
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

  if (!can(user, "orders:create")) {
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

  // Story 8.25 — grade cor×tamanho (opcional, retrocompatível).
  // Quando size_grid é informado, valida conservação: quantity = soma(size_grid).
  const grid = validateSizeGrid(body.size_grid);
  if (grid.error) {
    return NextResponse.json({ error: grid.error }, { status: 400 });
  }
  if (grid.value && grid.sum !== body.quantity) {
    return NextResponse.json(
      {
        error: `A soma da grade de tamanhos (${grid.sum}) deve ser igual à quantidade do lote (${body.quantity})`,
      },
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
      color: typeof body.color === "string" && body.color.trim() ? body.color.trim() : null,
      size_grid: grid.value,
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

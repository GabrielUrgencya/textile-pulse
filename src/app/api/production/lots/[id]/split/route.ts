import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";

/**
 * Story 8.15 — Fracionamento Manual de Lote
 * POST: divide um lote em partes [{quantity, label?}].
 * Regras:
 *  - Só fraciona em etapa inicial (status CREATED ou IN_CUT)
 *  - Soma das partes não pode exceder a quantidade do lote
 *  - Conservação de peças: filhos + restante = quantidade original
 */

const SPLITTABLE_STATUSES = ["CREATED", "IN_CUT"];

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  if (!can(user, "orders:create")) {
    return NextResponse.json(
      { error: "Forbidden: orders:create required" },
      { status: 403 }
    );
  }

  const { id: lotId } = params;
  const body = await request.json().catch(() => null);

  const parts: { quantity: number; label?: string }[] = Array.isArray(body?.parts)
    ? body.parts
    : [];

  if (parts.length === 0) {
    return NextResponse.json(
      { error: "Informe ao menos uma parte para fracionar" },
      { status: 400 }
    );
  }

  // Normaliza e valida cada parte
  const normalized = parts.map((p) => ({
    quantity: Math.trunc(Number(p.quantity)),
    label: p.label?.toString().trim() || null,
  }));

  if (normalized.some((p) => Number.isNaN(p.quantity) || p.quantity < 1)) {
    return NextResponse.json(
      { error: "Cada parte deve ter quantidade inteira >= 1" },
      { status: 400 }
    );
  }

  const sumParts = normalized.reduce((acc, p) => acc + p.quantity, 0);

  // Busca o lote (RLS por tenant via cadeia lots->po)
  const { data: lot, error: lotError } = await supabase
    .from("lots")
    .select("id, po_id, quantity, status, current_stage_id, lot_number")
    .eq("id", lotId)
    .single();

  if (lotError || !lot) {
    return NextResponse.json({ error: "Lote não encontrado" }, { status: 404 });
  }

  // AC5: só fraciona em etapa inicial
  if (!SPLITTABLE_STATUSES.includes(lot.status)) {
    return NextResponse.json(
      { error: `Lote só pode ser fracionado nas etapas iniciais (atual: ${lot.status})` },
      { status: 409 }
    );
  }

  // AC2: soma não pode exceder
  if (sumParts > lot.quantity) {
    return NextResponse.json(
      {
        error: `A soma das partes (${sumParts}) excede a quantidade do lote (${lot.quantity})`,
      },
      { status: 400 }
    );
  }

  const remainder = lot.quantity - sumParts;

  // Número da OP para gerar barcodes dos filhos
  const { data: order } = await supabase
    .from("production_orders")
    .select("op_number")
    .eq("id", lot.po_id)
    .single();

  if (!order) {
    return NextResponse.json({ error: "OP do lote não encontrada" }, { status: 404 });
  }

  // Sequência de barcode continua a partir do total de lotes da OP
  const { count } = await supabase
    .from("lots")
    .select("id", { count: "exact", head: true })
    .eq("po_id", lot.po_id);

  let seq = count || 0;

  const childRows = normalized.map((p) => {
    seq += 1;
    const lotNumber = `L${String(seq).padStart(3, "0")}`;
    return {
      po_id: lot.po_id,
      barcode: `OP-${order.op_number}-${lotNumber}`,
      lot_number: lotNumber,
      quantity: p.quantity,
      current_stage_id: lot.current_stage_id,
      status: lot.status,
      destination: p.label, // Fase 1: label livre (cor/tamanho/modelo)
      created_by: user.id,
    };
  });

  const { data: children, error: insertError } = await supabase
    .from("lots")
    .insert(childRows)
    .select("id, barcode, lot_number, quantity, destination, status");

  if (insertError) {
    if (insertError.message.includes("unique") || insertError.message.includes("duplicate")) {
      return NextResponse.json(
        { error: "Conflito de código de barras ao gerar filhos. Tente novamente." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Falha ao criar lotes filhos", details: insertError.message },
      { status: 500 }
    );
  }

  // Ajusta o lote-mãe: reduz para o restante; se zerou, remove (substituído pelos filhos)
  if (remainder === 0) {
    const { error: delError } = await supabase.from("lots").delete().eq("id", lot.id);
    if (delError) {
      return NextResponse.json(
        { error: "Filhos criados, mas falha ao remover lote-mãe zerado", children },
        { status: 207 }
      );
    }
  } else {
    const { error: updError } = await supabase
      .from("lots")
      .update({ quantity: remainder })
      .eq("id", lot.id);
    if (updError) {
      return NextResponse.json(
        { error: "Filhos criados, mas falha ao ajustar lote-mãe", children },
        { status: 207 }
      );
    }
  }

  return NextResponse.json(
    {
      data: {
        children,
        mother_remaining: remainder,
        mother_removed: remainder === 0,
      },
    },
    { status: 201 }
  );
}

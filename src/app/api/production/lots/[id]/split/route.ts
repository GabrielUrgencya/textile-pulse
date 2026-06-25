import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";

/**
 * Story 8.15 + 8.26 — Fracionamento Manual de Lote
 * POST: divide um lote em partes.
 *
 * MODO LEGADO (lote sem size_grid): parts = [{quantity, label?}]
 *   - reduz lot.quantity; filhos recebem destination=label.
 *
 * MODO GRADE (lote COM size_grid e ao menos uma parte com `sizes`): parts = [{sizes:{P:2,G:5}, label?}]
 *   - quantity da parte = soma(sizes); filho herda color da mãe, size_grid=sizes, destination=label.
 *   - conservação POR TAMANHO: soma retirada por tamanho não excede a grade da mãe.
 *   - reduz a grade da mãe por tamanho; quantity da mãe = soma da grade restante.
 *
 * Regras comuns:
 *   - Só fraciona em etapa inicial (CREATED ou IN_CUT)
 *   - Conservação de peças: filhos + restante = quantidade original
 *   - Se a mãe zerar, é removida (substituída pelos filhos)
 */

const SPLITTABLE_STATUSES = ["CREATED", "IN_CUT"];

type Grid = Record<string, number>;

function normalizeGrid(raw: unknown): Grid | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Grid = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const label = k.trim();
    if (!label) continue;
    const n = Math.trunc(Number(v));
    if (Number.isNaN(n) || n <= 0) continue;
    out[label] = n;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function sumGrid(g: Grid): number {
  return Object.values(g).reduce((a, b) => a + b, 0);
}

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
  const rawParts: unknown[] = Array.isArray(body?.parts) ? body.parts : [];

  if (rawParts.length === 0) {
    return NextResponse.json(
      { error: "Informe ao menos uma parte para fracionar" },
      { status: 400 }
    );
  }

  // Busca o lote (RLS por tenant via cadeia lots->po)
  const { data: lot, error: lotError } = await supabase
    .from("lots")
    .select("id, po_id, quantity, status, current_stage_id, lot_number, color, size_grid")
    .eq("id", lotId)
    .single();

  if (lotError || !lot) {
    return NextResponse.json({ error: "Lote não encontrado" }, { status: 404 });
  }

  // AC5/8.15: só fraciona em etapa inicial
  if (!SPLITTABLE_STATUSES.includes(lot.status)) {
    return NextResponse.json(
      { error: `Lote só pode ser fracionado nas etapas iniciais (atual: ${lot.status})` },
      { status: 409 }
    );
  }

  const motherGrid = normalizeGrid(lot.size_grid);
  const wantsGridMode =
    !!motherGrid &&
    rawParts.some(
      (p) => p && typeof p === "object" && (p as { sizes?: unknown }).sizes &&
        typeof (p as { sizes?: unknown }).sizes === "object",
    );

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

  // ─────────────────────────────────────────────────────────────
  // MODO GRADE (Story 8.26): fracionar por tamanho
  // ─────────────────────────────────────────────────────────────
  if (wantsGridMode && motherGrid) {
    const parts = rawParts.map((p) => {
      const obj = p as { sizes?: Record<string, unknown>; label?: unknown };
      const sizes = normalizeGrid(obj.sizes) || {};
      return {
        sizes,
        quantity: sumGrid(sizes),
        label: obj.label?.toString().trim() || null,
      };
    });

    if (parts.some((p) => p.quantity < 1)) {
      return NextResponse.json(
        { error: "Cada parte deve retirar ao menos 1 peça de algum tamanho" },
        { status: 400 }
      );
    }

    // Conservação por tamanho: soma retirada por tamanho não excede a grade da mãe
    const pulled: Grid = {};
    for (const part of parts) {
      for (const [size, qty] of Object.entries(part.sizes)) {
        pulled[size] = (pulled[size] || 0) + qty;
      }
    }
    for (const [size, qty] of Object.entries(pulled)) {
      const available = motherGrid[size] || 0;
      if (qty > available) {
        return NextResponse.json(
          { error: `Tamanho ${size}: tentou retirar ${qty}, disponível ${available}` },
          { status: 400 }
        );
      }
    }

    // Grade restante da mãe
    const remainingGrid: Grid = {};
    for (const [size, qty] of Object.entries(motherGrid)) {
      const r = qty - (pulled[size] || 0);
      if (r > 0) remainingGrid[size] = r;
    }
    const motherRemaining = sumGrid(remainingGrid);

    const childRows = parts.map((p) => {
      seq += 1;
      const lotNumber = `L${String(seq).padStart(3, "0")}`;
      return {
        po_id: lot.po_id,
        barcode: `OP-${order.op_number}-${lotNumber}`,
        lot_number: lotNumber,
        quantity: p.quantity,
        current_stage_id: lot.current_stage_id,
        status: lot.status,
        color: lot.color, // filho herda a cor da mãe
        size_grid: p.sizes,
        destination: p.label, // rótulo opcional (ex.: modelo)
        created_by: user.id,
      };
    });

    const { data: children, error: insertError } = await supabase
      .from("lots")
      .insert(childRows)
      .select("id, barcode, lot_number, quantity, color, size_grid, destination, status");

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

    // Ajusta a mãe: reduz a grade; se zerou, remove
    if (motherRemaining === 0) {
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
        .update({ quantity: motherRemaining, size_grid: remainingGrid })
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
          mother_remaining: motherRemaining,
          mother_removed: motherRemaining === 0,
          mode: "grid",
        },
      },
      { status: 201 }
    );
  }

  // ─────────────────────────────────────────────────────────────
  // MODO LEGADO (Story 8.15): fracionar por quantidade + rótulo
  // ─────────────────────────────────────────────────────────────
  const normalized = rawParts.map((p) => {
    const obj = p as { quantity?: unknown; label?: unknown };
    return {
      quantity: Math.trunc(Number(obj.quantity)),
      label: obj.label?.toString().trim() || null,
    };
  });

  if (normalized.some((p) => Number.isNaN(p.quantity) || p.quantity < 1)) {
    return NextResponse.json(
      { error: "Cada parte deve ter quantidade inteira >= 1" },
      { status: 400 }
    );
  }

  const sumParts = normalized.reduce((acc, p) => acc + p.quantity, 0);

  if (sumParts > lot.quantity) {
    return NextResponse.json(
      {
        error: `A soma das partes (${sumParts}) excede a quantidade do lote (${lot.quantity})`,
      },
      { status: 400 }
    );
  }

  const remainder = lot.quantity - sumParts;

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
      destination: p.label, // rótulo livre (cor/tamanho/modelo)
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
        mode: "legacy",
      },
    },
    { status: 201 }
  );
}

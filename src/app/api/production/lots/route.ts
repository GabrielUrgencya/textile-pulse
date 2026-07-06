import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";
import { dbError, requireTenantId } from "@/lib/api-helpers";
import {
  ELIGIBLE_PO_STATUSES,
  LOT_BUSY_SHIPMENT_STATUSES,
  isEligiblePoStatus,
  poStatusLabel,
} from "@/lib/production-orders";

/**
 * GET /api/production/lots
 *   ?available=true  → lotes do tenant disponíveis para envio a facção
 *                      (com quantidade e que não estão em remessa ativa).
 *   ?barcode=CODE    → resolve um lote/sublote pelo código de barras (paste),
 *                      independentemente de estar na lista "disponível".
 *
 * Frente C (Facções): esta rota faltava — a lista de lotes do ShipmentCreate
 * batia em 404. Escopo de tenant garantido via production_orders.po_id
 * (lots não tem tenant_id próprio), defendendo contra vazamento entre tenants.
 *
 * Resposta: { data: [{ id, code, quantity, op_code }] }
 */

const LOT_LIST_LIMIT = 300;

interface LotRow {
  id: string;
  barcode: string;
  quantity: number | null;
  color: string | null;
  po_id: string;
  status: string;
  production_orders?: { op_number?: string | null } | null;
}

function toLotDTO(l: LotRow) {
  return {
    id: l.id,
    code: l.barcode,
    quantity: l.quantity ?? 0,
    color: l.color ?? null,
    op_code: l.production_orders?.op_number ?? null,
  };
}

export async function GET(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  // Envio a facção é quem consome esta lista; exige factions:view.
  if (!can(user, "factions:view") && !can(user, "orders:view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const t = requireTenantId(user);
  if (t.error) return t.error;

  const { searchParams } = new URL(request.url);
  const barcode = searchParams.get("barcode")?.trim();
  const available = searchParams.get("available") === "true";

  // Tenant scoping: production_orders do tenant (RLS + filtro explícito).
  // F1: guarda também o status para a barreira de elegibilidade (só OPs
  // OPEN/IN_PROGRESS podem ir a remessa — canceladas/encerradas ficam fora).
  const { data: pos, error: poErr } = await supabase
    .from("production_orders")
    .select("id, status, op_number")
    .eq("tenant_id", t.tenantId);
  if (poErr) return dbError("GET /api/production/lots (pos)", poErr);

  const posById = new Map((pos || []).map((p) => [p.id as string, p]));
  const eligiblePoIds = (pos || [])
    .filter((p) => (ELIGIBLE_PO_STATUSES as readonly string[]).includes(p.status as string))
    .map((p) => p.id as string);
  const allPoIds = (pos || []).map((p) => p.id as string);
  if (allPoIds.length === 0) return NextResponse.json({ data: [] });

  // --- Lookup por barcode (paste) ---
  if (barcode) {
    // Escopo de tenant amplo para ACHAR o lote; elegibilidade validada depois
    // para responder 422 descritivo em vez de 404 genérico.
    const { data, error } = await supabase
      .from("lots")
      .select("id, barcode, quantity, color, po_id, status, production_orders!inner(op_number)")
      .eq("barcode", barcode)
      .in("po_id", allPoIds)
      .maybeSingle();
    if (error) return dbError("GET /api/production/lots (barcode)", error);
    if (!data) {
      return NextResponse.json({ error: "Lote não encontrado" }, { status: 404 });
    }
    const po = posById.get((data as unknown as LotRow).po_id);
    if (!isEligiblePoStatus(po?.status as string)) {
      const opNum = (po?.op_number as string) || (data as unknown as LotRow).production_orders?.op_number || "?";
      return NextResponse.json(
        { error: `OP ${opNum} está ${poStatusLabel(po?.status as string)} — lote não disponível para remessa` },
        { status: 422 },
      );
    }
    return NextResponse.json({ data: toLotDTO(data as unknown as LotRow) });
  }

  // --- Lista de lotes (só de OPs elegíveis — F1: canceladas/encerradas fora) ---
  if (eligiblePoIds.length === 0) return NextResponse.json({ data: [] });
  const { data: lots, error } = await supabase
    .from("lots")
    .select("id, barcode, quantity, color, po_id, status, production_orders!inner(op_number)")
    .in("po_id", eligiblePoIds)
    .order("created_at", { ascending: false })
    .limit(LOT_LIST_LIMIT);
  if (error) return dbError("GET /api/production/lots", error);

  let rows = (lots || []) as unknown as LotRow[];

  if (available) {
    // Exclui lotes em remessa de posse ativa. F1b: o valor antigo "RECEIVED"
    // não existe no enum — toda remessa (até RETURNED) prendia o lote para
    // sempre. RETURNED/CLOSED liberam o lote para novo envio.
    const { data: activeShipments } = await supabase
      .from("faction_shipments")
      .select("lot_id, status")
      .not("lot_id", "is", null)
      .in("status", LOT_BUSY_SHIPMENT_STATUSES as unknown as string[]);
    const busy = new Set((activeShipments || []).map((s) => s.lot_id as string));
    rows = rows.filter((l) => (l.quantity ?? 0) > 0 && !busy.has(l.id));
  }

  return NextResponse.json({ data: rows.map(toLotDTO) });
}

import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { hasPermission, type AppRole } from "@/lib/permissions";

const EDITABLE_STATUSES = ["CREATED", "IN_CUT"];

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase } = auth;

  const { id } = params;

  // Fetch lot (RLS filters by tenant via lots→po→tenant_id chain)
  const { data: lot, error: lotError } = await supabase
    .from("lots")
    .select("*, production_orders(op_number, product_name, reference)")
    .eq("id", id)
    .single();

  if (lotError || !lot) {
    return NextResponse.json({ error: "Lot not found" }, { status: 404 });
  }

  // Fetch scan history
  const { data: scans } = await supabase
    .from("scan_events")
    .select("id, stage_id, user_id, event_type, scanned_at, device_info")
    .eq("lot_id", id)
    .order("scanned_at", { ascending: true });

  // Fetch defect records
  const { data: defects } = await supabase
    .from("defect_records")
    .select("id, quantity, defect_type, severity, description, detected_at, status, discarded_quantity")
    .eq("lot_id", id)
    .order("detected_at", { ascending: true });

  // Story 8.14: duracao por etapa (pareando STAGE_IN -> STAGE_OUT em ordem cronologica)
  const stageDurations = computeStageDurations(scans || []);

  return NextResponse.json({
    lot,
    scan_history: scans || [],
    defect_records: defects || [],
    stage_durations: stageDurations,
  });
}

/**
 * Story 8.19 — Edição manual de lote (quantidade/identificação).
 * Permitido apenas em etapas iniciais (CREATED/IN_CUT) para não corromper metas.
 */
export async function PATCH(
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

  const { id } = params;
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { data: lot, error: lotError } = await supabase
    .from("lots")
    .select("id, status")
    .eq("id", id)
    .single();

  if (lotError || !lot) {
    return NextResponse.json({ error: "Lote não encontrado" }, { status: 404 });
  }

  if (!EDITABLE_STATUSES.includes(lot.status)) {
    return NextResponse.json(
      { error: `Lote só pode ser editado nas etapas iniciais (atual: ${lot.status})` },
      { status: 409 }
    );
  }

  const update: Record<string, unknown> = {};

  if (body.quantity !== undefined) {
    const qty = Math.trunc(Number(body.quantity));
    if (Number.isNaN(qty) || qty < 1) {
      return NextResponse.json(
        { error: "quantity deve ser um inteiro >= 1" },
        { status: 400 }
      );
    }
    update.quantity = qty;
  }

  if (body.destination !== undefined) {
    update.destination = body.destination?.toString().trim() || null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 });
  }

  const { data: updated, error: updateError } = await supabase
    .from("lots")
    .update(update)
    .eq("id", id)
    .select("id, barcode, lot_number, quantity, destination, status")
    .single();

  if (updateError) {
    return NextResponse.json(
      { error: "Falha ao atualizar lote", details: updateError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: updated });
}

interface ScanRow {
  stage_id: string | null;
  event_type: string;
  scanned_at: string;
}

interface StageDuration {
  stage_id: string;
  started_at: string;
  ended_at: string | null;
  duration_hours: number | null;
  open: boolean;
}

/** Pareia STAGE_IN/STAGE_OUT por etapa e calcula a duracao de cada passagem. */
function computeStageDurations(scans: ScanRow[]): StageDuration[] {
  const result: StageDuration[] = [];
  const openByStage = new Map<string, string>(); // stage_id -> in scanned_at

  for (const s of scans) {
    if (!s.stage_id) continue;
    if (s.event_type === "STAGE_IN") {
      // Se ja havia um IN aberto sem OUT, fecha o anterior como "open" antes de abrir novo
      if (openByStage.has(s.stage_id)) {
        result.push({
          stage_id: s.stage_id,
          started_at: openByStage.get(s.stage_id)!,
          ended_at: null,
          duration_hours: null,
          open: true,
        });
      }
      openByStage.set(s.stage_id, s.scanned_at);
    } else if (s.event_type === "STAGE_OUT") {
      const startedAt = openByStage.get(s.stage_id);
      if (startedAt) {
        const ms = new Date(s.scanned_at).getTime() - new Date(startedAt).getTime();
        result.push({
          stage_id: s.stage_id,
          started_at: startedAt,
          ended_at: s.scanned_at,
          duration_hours: Math.round((ms / 3_600_000) * 100) / 100,
          open: false,
        });
        openByStage.delete(s.stage_id);
      }
    }
  }

  // Etapas ainda abertas (IN sem OUT)
  openByStage.forEach((startedAt, stageId) => {
    result.push({
      stage_id: stageId,
      started_at: startedAt,
      ended_at: null,
      duration_hours: null,
      open: true,
    });
  });

  return result;
}

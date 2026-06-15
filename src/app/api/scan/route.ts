import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { checkRateLimitCustom } from "@/lib/rate-limiter";

const SCAN_RATE_LIMIT = 100; // max requests
const SCAN_RATE_WINDOW = 60 * 1000; // per 1 minute

const BARCODE_REGEX = /^OP-[0-9]{8}-[0-9]{3}-L[0-9]{3}$/;

// Stage name → LotStatus mapping
const STAGE_STATUS_MAP: Record<string, string> = {
  CORTE: "IN_CUT",
  AVIAMENTOS: "IN_TRIMS",
  PRODUCAO: "IN_PRODUCTION",
  TRAVETE: "IN_FINISHING",
  LIMPEZA: "IN_CLEANING",
  CONFERENCIA: "IN_QUALITY",
  EMBALAGEM: "IN_PACKING",
  ESTOQUE: "IN_STOCK",
};

export async function POST(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  // Rate limit: 100 scans/min per user
  const rl = checkRateLimitCustom(`scan:${user.id}`, SCAN_RATE_LIMIT, SCAN_RATE_WINDOW);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again shortly." },
      {
        status: 429,
        headers: {
          "X-RateLimit-Remaining": "0",
          "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)),
        },
      }
    );
  }

  const body = await request.json().catch(() => null);

  if (!body?.barcode || !body?.stage_id) {
    return NextResponse.json(
      { error: "barcode and stage_id are required" },
      { status: 400 }
    );
  }

  const { barcode, stage_id, device_info } = body as {
    barcode: string;
    stage_id: string;
    device_info?: string;
  };

  // Story 8.14: event_type opcional, default STAGE_IN (retrocompativel)
  const eventType: "STAGE_IN" | "STAGE_OUT" =
    body.event_type === "STAGE_OUT" ? "STAGE_OUT" : "STAGE_IN";

  // AC2: Validate barcode format
  if (!BARCODE_REGEX.test(barcode)) {
    return NextResponse.json(
      {
        error: "Invalid barcode format. Expected: OP-YYYYMMDD-NNN-LNNN",
      },
      { status: 400 }
    );
  }

  // Fetch lot by barcode (include tenant_id filter via RLS + explicit check)
  const { data: lot, error: lotError } = await supabase
    .from("lots")
    .select("id, current_stage_id, status, po_id")
    .eq("barcode", barcode)
    .single();

  // Save previous stage for out-of-order check (before update)
  const previousStageId = lot?.current_stage_id;

  if (lotError || !lot) {
    return NextResponse.json({ error: "Lot not found" }, { status: 404 });
  }

  // Fetch stage to validate it exists and get its name
  const { data: stage, error: stageError } = await supabase
    .from("stages")
    .select("id, name, order_index")
    .eq("id", stage_id)
    .single();

  if (stageError || !stage) {
    return NextResponse.json({ error: "Stage not found" }, { status: 404 });
  }

  // Story 8.14: estado da etapa por contagem de IN/OUT
  // "IN aberto" = existe um STAGE_IN sem STAGE_OUT correspondente na mesma etapa.
  const { data: stageScans } = await supabase
    .from("scan_events")
    .select("id, event_type, scanned_at")
    .eq("lot_id", lot.id)
    .eq("stage_id", stage_id)
    .in("event_type", ["STAGE_IN", "STAGE_OUT"]);

  const inCount = (stageScans || []).filter((s) => s.event_type === "STAGE_IN").length;
  const outCount = (stageScans || []).filter((s) => s.event_type === "STAGE_OUT").length;
  const hasOpenIn = inCount > outCount;

  if (eventType === "STAGE_IN" && hasOpenIn) {
    // AC5: ja existe um inicio aberto sem fim — evita duplicar inicio
    return NextResponse.json(
      { error: `Lote já tem início em aberto na etapa ${stage.name}. Bipe o fim (STAGE_OUT) antes.` },
      { status: 409 }
    );
  }

  if (eventType === "STAGE_OUT" && !hasOpenIn) {
    // AC4: fim sem inicio previo aberto
    return NextResponse.json(
      { error: `Não há início em aberto na etapa ${stage.name} para registrar o fim.` },
      { status: 409 }
    );
  }

  // AC1, AC2: Create scan_event (IN ou OUT)
  const { data: scanEvent, error: scanError } = await supabase
    .from("scan_events")
    .insert({
      lot_id: lot.id,
      stage_id: stage_id,
      user_id: user.id,
      event_type: eventType,
      device_info: device_info || null,
      metadata: {},
    })
    .select()
    .single();

  if (scanError) {
    return NextResponse.json(
      { error: "Failed to create scan event", details: scanError.message },
      { status: 500 }
    );
  }

  // AC3: Atualiza status/etapa SOMENTE no inicio (STAGE_IN).
  // No fim (STAGE_OUT) a etapa fica fechada — nao regride status nem reseta o relogio da etapa.
  let newStatus = lot.status;
  if (eventType === "STAGE_IN") {
    newStatus = STAGE_STATUS_MAP[stage.name] || lot.status;

    const { error: updateError } = await supabase
      .from("lots")
      .update({
        current_stage_id: stage_id,
        status: newStatus,
        entered_current_stage_at: new Date().toISOString(),
      })
      .eq("id", lot.id);

    if (updateError) {
      return NextResponse.json(
        { error: "Scan recorded but lot status update failed", scan_event: scanEvent },
        { status: 207 }
      );
    }
  }

  // Check if scan is out of order (warn but don't block)
  // Uses previousStageId saved BEFORE the update to avoid always comparing with itself
  // Detects both: going backward AND skipping stages forward (gap > 1)
  let outOfOrder = false;
  if (previousStageId) {
    const { data: prevStage } = await supabase
      .from("stages")
      .select("order_index")
      .eq("id", previousStageId)
      .single();

    if (prevStage) {
      const gap = stage.order_index - prevStage.order_index;
      // backward (gap < 0) or skipping ahead (gap > 1)
      if (gap < 0 || gap > 1) {
        outOfOrder = true;
      }
    }
  }

  // Story 8.14: no fim, calcula duracao da etapa (OUT - ultimo IN aberto)
  let stageDurationHours: number | null = null;
  if (eventType === "STAGE_OUT") {
    const lastIn = (stageScans || [])
      .filter((s) => s.event_type === "STAGE_IN")
      .sort((a, b) => new Date(b.scanned_at).getTime() - new Date(a.scanned_at).getTime())[0];
    if (lastIn) {
      const ms =
        new Date(scanEvent.scanned_at).getTime() - new Date(lastIn.scanned_at).getTime();
      stageDurationHours = Math.round((ms / 3_600_000) * 100) / 100;
    }
  }

  return NextResponse.json({
    scan_event: scanEvent,
    event_type: eventType,
    lot_status: newStatus,
    ...(stageDurationHours !== null && { stage_duration_hours: stageDurationHours }),
    ...(outOfOrder && {
      warning: "Scan recorded out of expected stage order",
    }),
  });
}

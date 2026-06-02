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

  // AC2: Validate barcode format
  if (!BARCODE_REGEX.test(barcode)) {
    return NextResponse.json(
      {
        error: "Invalid barcode format. Expected: OP-YYYYMMDD-NNN-LNNN",
      },
      { status: 400 }
    );
  }

  // Fetch lot by barcode
  const { data: lot, error: lotError } = await supabase
    .from("lots")
    .select("id, current_stage_id, status, po_id")
    .eq("barcode", barcode)
    .single();

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

  // AC4: Check for duplicate scan (same lot + same stage)
  const { data: existingScan } = await supabase
    .from("scan_events")
    .select("id")
    .eq("lot_id", lot.id)
    .eq("stage_id", stage_id)
    .eq("event_type", "STAGE_IN")
    .limit(1)
    .maybeSingle();

  if (existingScan) {
    return NextResponse.json(
      {
        error: `Lot already scanned at stage ${stage.name}`,
        scan_event_id: existingScan.id,
      },
      { status: 409 }
    );
  }

  // AC1, AC5: Create scan_event
  const { data: scanEvent, error: scanError } = await supabase
    .from("scan_events")
    .insert({
      lot_id: lot.id,
      stage_id: stage_id,
      user_id: user.id,
      event_type: "STAGE_IN",
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

  // AC3: Update lot status and current_stage_id
  const newStatus = STAGE_STATUS_MAP[stage.name] || lot.status;

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

  // Check if scan is out of order (warn but don't block)
  let outOfOrder = false;
  if (lot.current_stage_id) {
    const { data: currentStage } = await supabase
      .from("stages")
      .select("order_index")
      .eq("id", lot.current_stage_id)
      .single();

    if (currentStage && stage.order_index < currentStage.order_index) {
      outOfOrder = true;
    }
  }

  return NextResponse.json({
    scan_event: scanEvent,
    lot_status: newStatus,
    ...(outOfOrder && {
      warning: "Scan recorded out of expected stage order",
    }),
  });
}

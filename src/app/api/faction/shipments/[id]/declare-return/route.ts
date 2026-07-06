import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateFactionSession } from "@/lib/faction-middleware";
import { generateUniqueDeliveryCode } from "@/lib/delivery-code";
import { logShipmentEvent } from "@/lib/shipment-events";

/**
 * POST /api/faction/shipments/[id]/declare-return
 * Devolução Híbrida A+B — passo 1 (facção declara).
 * A facção informa quantas peças boas/defeituosas vai devolver e a data
 * estimada. O sistema gera um CÓDIGO DE DEVOLUÇÃO (que a facção repassa ao
 * motorista) e move a remessa para RETURN_DECLARED. A conferência cega na
 * fábrica valida esse código depois.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await validateFactionSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);

  const ok = Number(body?.ok);
  const defect = Number(body?.defect);
  const estimatedDate: string | undefined = body?.estimatedDate;

  if (!Number.isFinite(ok) || !Number.isFinite(defect) || ok < 0 || defect < 0) {
    return NextResponse.json(
      { error: "INVALID_QUANTITIES", message: "Quantidades inválidas" },
      { status: 400 }
    );
  }
  if (!estimatedDate || !/^\d{4}-\d{2}-\d{2}$/.test(estimatedDate)) {
    return NextResponse.json(
      { error: "INVALID_DATE", message: "Data estimada de devolução é obrigatória" },
      { status: 400 }
    );
  }
  // Data não pode ser no passado (compara por dia).
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (new Date(`${estimatedDate}T00:00:00`) < today) {
    return NextResponse.json(
      { error: "PAST_DATE", message: "A data de devolução não pode ser no passado" },
      { status: 400 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Ownership + estado
  const { data: shipment, error: fetchError } = await supabase
    .from("faction_shipments")
    .select("id, faction_id, tenant_id, status, quantity_sent, faction_confirmed_at")
    .eq("id", id)
    .eq("faction_id", session.factionId)
    .single();

  if (fetchError || !shipment) {
    return NextResponse.json({ error: "Shipment not found" }, { status: 404 });
  }

  if (shipment.status !== "RECEIVED_BY_FACTION") {
    return NextResponse.json(
      {
        error: "INVALID_STATUS",
        message: "A remessa precisa estar 'Com a facção' para declarar devolução",
      },
      { status: 422 }
    );
  }

  const sent = Number(shipment.quantity_sent || 0);
  if (ok + defect > sent) {
    return NextResponse.json(
      {
        error: "OVER_DECLARED",
        message: `Não é possível devolver mais que ${sent} peças enviadas`,
      },
      { status: 400 }
    );
  }

  // Gera o código de devolução (dedup na coluna return_code)
  let returnCode: string | null = null;
  let expiresAt: string | null = null;
  try {
    const dc = await generateUniqueDeliveryCode(supabase, "return_code");
    returnCode = dc.code;
    expiresAt = dc.expiresAt;
  } catch {
    return NextResponse.json(
      { error: "CODE_GEN_FAILED", message: "Falha ao gerar código de devolução" },
      { status: 500 }
    );
  }

  const { error: updateError } = await supabase
    .from("faction_shipments")
    .update({
      declared_ok: ok,
      declared_defect: defect,
      declared_at: new Date().toISOString(),
      faction_estimated_return: estimatedDate,
      return_code: returnCode,
      return_code_expires_at: expiresAt,
      return_code_attempts: 0,
      status: "RETURN_DECLARED",
    })
    .eq("id", id)
    .eq("faction_id", session.factionId);

  if (updateError) {
    console.error("[faction/declare-return] Update error:", updateError);
    return NextResponse.json({ error: "Failed to declare return" }, { status: 500 });
  }

  // Timeline (épico Robustez F2) — best-effort.
  if (shipment.tenant_id) {
    await logShipmentEvent(supabase, {
      tenantId: shipment.tenant_id as string,
      shipmentId: id,
      eventType: "RETURN_DECLARED",
      actorType: "FACTION",
      actorName: session.factionName ?? null,
      payload: { declared_ok: ok, declared_defect: defect },
    });
  }

  return NextResponse.json({
    success: true,
    shipmentId: id,
    returnCode,
    expiresAt,
    status: "RETURN_DECLARED",
  });
}

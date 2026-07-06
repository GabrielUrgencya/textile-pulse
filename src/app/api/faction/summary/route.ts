import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateFactionSession } from "@/lib/faction-middleware";

/**
 * GET /api/faction/summary
 * AC1: Returns faction summary — total pieces, next deadline, amount receivable, general status.
 */
export async function GET() {
  const session = await validateFactionSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const now = new Date().toISOString();

  const [shipmentsResult, returnedResult, defectsResult, notificationsResult, factionResult] = await Promise.all([
    // F4: posse ATIVA real — PREPARING (ainda na fábrica), RETURNED e CLOSED fora.
    supabase
      .from("faction_shipments")
      .select("id, quantity_sent, quantity_returned, quantity_defective, expected_return_at, status, faction_confirmed_at")
      .eq("faction_id", session.factionId)
      .in("status", ["SENT", "RECEIVED_BY_FACTION", "RETURN_DECLARED", "PARTIALLY_RETURNED", "OVERDUE"]),

    // F4c: remessas que passaram pela devolução (encerradas ou não).
    supabase
      .from("faction_shipments")
      .select("id, quantity_returned, quantity_defective")
      .eq("faction_id", session.factionId)
      .in("status", ["RETURNED", "PARTIALLY_RETURNED", "CLOSED"]),

    // Pending defects (no faction response yet)
    supabase
      .from("defect_records")
      .select("id, faction_shipments!inner(faction_id)", { count: "exact", head: true })
      .eq("faction_shipments.faction_id", session.factionId)
      .is("faction_response", null),

    // Unread notifications (bug fix: a coluna é read_at, não "read"; audience FACTION)
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("faction_id", session.factionId)
      .eq("audience", "FACTION")
      .is("read_at", null),

    // FONTE ÚNICA do valor financeiro: saldo do ledger (factions.current_balance).
    // Mesmo campo que /api/faction/financial expõe — Início e Pagamentos sempre iguais.
    supabase
      .from("factions")
      .select("current_balance")
      .eq("id", session.factionId)
      .single(),
  ]);

  const active = shipmentsResult.data || [];

  // F4: peças em posse = enviadas − devolvidas (boas) − defeituosas conferidas
  // (o receive grava quantity_returned = boas e quantity_defective separado;
  // ambas já voltaram à fábrica). Nunca negativo por remessa.
  const totalPiecesWithFaction = active.reduce(
    (sum, s) =>
      sum +
      Math.max(
        0,
        (s.quantity_sent || 0) - (s.quantity_returned || 0) - (s.quantity_defective || 0),
      ),
    0
  );

  // F4c: métricas de devolução (independem de encerramento)
  const returned = returnedResult.data || [];
  const returnedShipments = returned.length;
  const totalPiecesReturned = returned.reduce((sum, s) => sum + (s.quantity_returned || 0), 0);
  const totalDefectivePieces = returned.reduce((sum, s) => sum + (s.quantity_defective || 0), 0);
  const approvalRate =
    totalPiecesReturned + totalDefectivePieces > 0
      ? Math.round((totalPiecesReturned / (totalPiecesReturned + totalDefectivePieces)) * 100)
      : null;

  const nextDeadline = active
    .filter((s) => s.expected_return_at)
    .sort((a, b) =>
      new Date(a.expected_return_at).getTime() - new Date(b.expected_return_at).getTime()
    )[0]?.expected_return_at || null;

  // Shipments awaiting faction confirmation
  const pendingConfirmationShipments = active.filter(
    (s) => s.status === "SENT" && !s.faction_confirmed_at
  );

  // F4: aguardando devolução — "PENDING" não existe no enum (código morto removido).
  const pendingReturns = active.filter(
    (s) => s.status === "SENT" || s.status === "RECEIVED_BY_FACTION" || s.status === "OVERDUE"
  ).length;

  // Overdue: past expected_return_at (query já exclui RETURNED; "RECEIVED" não
  // existe no enum — bug antigo removido)
  const overdueCount = active.filter(
    (s) => s.expected_return_at && new Date(s.expected_return_at).toISOString() < now
  ).length;

  // Fonte única: saldo do ledger. Sem cálculo ad-hoc (o antigo
  // Σ(payment−deduction) duplicava a dedução e ignorava edições manuais).
  const currentBalance =
    Math.round(Number(factionResult.data?.current_balance || 0) * 100) / 100;

  return NextResponse.json({
    factionName: session.factionName,
    totalPiecesWithFaction,
    pendingReturns,
    pendingDefects: defectsResult.count ?? 0,
    currentBalance,
    /** @deprecated alias de currentBalance (compatibilidade) */
    currentPeriodValue: currentBalance,
    nextDeadline,
    overdueCount,
    // F4c: novos cards do portal
    returnedShipments,
    totalPiecesReturned,
    approvalRate,
    unreadNotifications: notificationsResult.count ?? 0,
    pendingConfirmation: pendingConfirmationShipments.length > 0,
    pendingShipmentId: pendingConfirmationShipments[0]?.id || null,
  });
}

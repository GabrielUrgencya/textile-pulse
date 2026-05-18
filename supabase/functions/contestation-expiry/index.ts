/**
 * Supabase Edge Function: contestation-expiry
 * Story 6.6 — Cron job for expired contestation resolution (R1)
 *
 * Schedule: 0 11 * * * (11:00 UTC = 08:00 BRT)
 *
 * Identifies defect contestations where the manager did not resolve
 * within 3 business days. Auto-resolves in favor of the faction:
 * - Zeros deduction_value on the associated shipment
 * - Sets contestation_resolved_at on the defect record
 * - Creates CRITICAL notification for the manager
 *
 * Runtime: Deno (Supabase Edge Functions)
 * Idempotent: filters on contestation_resolved_at IS NULL
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- Business Days (inline, adapted from src/lib/business-days.ts) ---

function isBusinessDay(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

function subtractBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let remaining = days;
  while (remaining > 0) {
    result.setDate(result.getDate() - 1);
    if (isBusinessDay(result)) {
      remaining--;
    }
  }
  return result;
}

// --- Main Handler ---

Deno.serve(async (req) => {
  // Allow manual trigger via POST or cron trigger
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // 3 business days ago from now
  const now = new Date();
  const cutoffDate = subtractBusinessDays(now, 3);
  const cutoffISO = cutoffDate.toISOString();

  // AC2: Find expired contestations
  const { data: expiredContestations, error: queryError } = await supabase
    .from("defect_records")
    .select(
      "id, shipment_id, lot_id, faction_response_at, faction_shipments!inner(id, faction_id, deduction_value, factions!inner(name, tenant_id))"
    )
    .eq("faction_response", "CONTESTED")
    .is("contestation_resolved_at", null)
    .lte("faction_response_at", cutoffISO);

  if (queryError) {
    console.error("[contestation-expiry] Query error:", queryError);
    return new Response(
      JSON.stringify({ error: "Query failed", details: queryError.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!expiredContestations || expiredContestations.length === 0) {
    return new Response(
      JSON.stringify({ processed: 0, message: "No expired contestations found" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  const nowISO = now.toISOString();
  let processed = 0;
  let errors = 0;

  for (const defect of expiredContestations) {
    const shipment = defect.faction_shipments as unknown as {
      id: string;
      faction_id: string;
      deduction_value: number;
      factions: { name: string; tenant_id: string };
    };

    try {
      // AC3: Zero deduction_value on shipment
      const { error: shipmentError } = await supabase
        .from("faction_shipments")
        .update({ deduction_value: 0 })
        .eq("id", shipment.id);

      if (shipmentError) {
        console.error(`[contestation-expiry] Shipment update failed for ${shipment.id}:`, shipmentError);
        errors++;
        continue;
      }

      // AC4: Set contestation_resolved_at
      const { error: defectError } = await supabase
        .from("defect_records")
        .update({ contestation_resolved_at: nowISO })
        .eq("id", defect.id);

      if (defectError) {
        console.error(`[contestation-expiry] Defect update failed for ${defect.id}:`, defectError);
        errors++;
        continue;
      }

      // AC5: CRITICAL notification for manager
      const { error: notifError } = await supabase
        .from("notifications")
        .insert({
          tenant_id: shipment.factions.tenant_id,
          type: "CONTESTATION_EXPIRED",
          title: `Contestação vencida — ${shipment.factions.name}`,
          message: `A contestação do defeito (ID: ${defect.id}) da facção ${shipment.factions.name} venceu após 3 dias úteis sem resolução. A dedução financeira foi zerada automaticamente.`,
          severity: "CRITICAL",
          faction_id: shipment.faction_id,
        });

      if (notifError) {
        console.error(`[contestation-expiry] Notification insert failed:`, notifError);
        // Don't skip — the important updates already went through
      }

      processed++;
    } catch (err) {
      console.error(`[contestation-expiry] Unexpected error for defect ${defect.id}:`, err);
      errors++;
    }
  }

  const result = {
    processed,
    errors,
    total: expiredContestations.length,
    cutoffDate: cutoffISO,
    executedAt: nowISO,
  };

  console.log("[contestation-expiry] Completed:", result);

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

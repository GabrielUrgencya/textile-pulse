import type { SupabaseClient } from "@supabase/supabase-js";

export interface AllowanceBreakdownByType {
  defect_type: string;
  count: number;
  quantity: number;
  percentage: number;
}

export interface AllowanceBreakdownByResponsible {
  user_id: string;
  full_name: string;
  count: number;
  quantity: number;
  percentage: number;
}

export interface AllowanceBreakdownByFaction {
  faction_id: string;
  faction_name: string;
  count: number;
  quantity: number;
  percentage: number;
}

export interface AllowanceResult {
  total_defects: number;
  total_quantity_defective: number;
  total_pieces_produced: number;
  allowance_rate: number;
  allowance_target: number;
  threshold_ratio: number;
  by_type: AllowanceBreakdownByType[];
  by_responsible: AllowanceBreakdownByResponsible[];
  by_faction: AllowanceBreakdownByFaction[];
}

/**
 * Compute allowance (defect rate) with breakdowns.
 * allowance_rate = total_quantity_defective / total_pieces_produced
 */
export async function computeAllowance(
  supabase: SupabaseClient,
  options: { from: string; to: string; allowanceTarget?: number }
): Promise<AllowanceResult> {
  const { from, to, allowanceTarget = 0.002 } = options;
  const fromStart = `${from}T00:00:00`;
  const toEnd = `${to}T23:59:59`;

  // Parallel queries: defects + total production
  const [defectsRes, productionRes] = await Promise.all([
    supabase
      .from("defect_records")
      .select("id, defect_type, quantity, lot_id, severity, detected_by")
      .gte("detected_at", fromStart)
      .lte("detected_at", toEnd),
    supabase
      .from("scan_events")
      .select("quantity_scanned")
      .eq("event_type", "STAGE_IN")
      .gte("scanned_at", fromStart)
      .lte("scanned_at", toEnd),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const defects: any[] = defectsRes.data || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scans: any[] = productionRes.data || [];

  const totalPiecesProduced = scans.reduce(
    (sum, s) => sum + (s.quantity_scanned || 0),
    0
  );
  const totalQuantityDefective = defects.reduce(
    (sum, d) => sum + (d.quantity || 0),
    0
  );
  const allowanceRate =
    totalPiecesProduced > 0 ? totalQuantityDefective / totalPiecesProduced : 0;
  const thresholdRatio =
    allowanceTarget > 0 ? allowanceRate / allowanceTarget : 0;

  // Breakdown by type
  const typeMap = new Map<string, { count: number; quantity: number }>();
  for (const d of defects) {
    const t = d.defect_type;
    const existing = typeMap.get(t) || { count: 0, quantity: 0 };
    existing.count++;
    existing.quantity += d.quantity || 0;
    typeMap.set(t, existing);
  }
  const byType: AllowanceBreakdownByType[] = Array.from(typeMap.entries()).map(
    ([defect_type, v]) => ({
      defect_type,
      count: v.count,
      quantity: v.quantity,
      percentage:
        totalQuantityDefective > 0 ? (v.quantity / totalQuantityDefective) * 100 : 0,
    })
  );
  byType.sort((a, b) => b.quantity - a.quantity);

  // Breakdown by responsible — for now group by detected_by
  // Full "penultimate scanner" logic requires per-lot scan history lookup
  // which is expensive for aggregated views. Use detected_by as proxy.
  const responsibleMap = new Map<string, { count: number; quantity: number }>();
  for (const d of defects) {
    const uid = d.detected_by;
    if (!uid) continue;
    const existing = responsibleMap.get(uid) || { count: 0, quantity: 0 };
    existing.count++;
    existing.quantity += d.quantity || 0;
    responsibleMap.set(uid, existing);
  }

  // Fetch profile names for responsible users
  const userIds = Array.from(responsibleMap.keys());
  let profileMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);
    if (profiles) {
      profileMap = new Map(profiles.map((p) => [p.id, p.full_name || "—"]));
    }
  }

  const byResponsible: AllowanceBreakdownByResponsible[] = Array.from(
    responsibleMap.entries()
  ).map(([user_id, v]) => ({
    user_id,
    full_name: profileMap.get(user_id) || "—",
    count: v.count,
    quantity: v.quantity,
    percentage:
      totalQuantityDefective > 0 ? (v.quantity / totalQuantityDefective) * 100 : 0,
  }));
  byResponsible.sort((a, b) => b.quantity - a.quantity);

  // Breakdown by faction — defects on AT_FACTION lots
  const factionLotIds = defects
    .map((d) => d.lot_id)
    .filter((id): id is string => !!id);
  const uniqueLotIds = Array.from(new Set(factionLotIds));

  const byFaction: AllowanceBreakdownByFaction[] = [];
  if (uniqueLotIds.length > 0) {
    const { data: shipments } = await supabase
      .from("faction_shipments")
      .select("lot_id, faction_id, factions(name)")
      .in("lot_id", uniqueLotIds);

    if (shipments && shipments.length > 0) {
      const factionMap = new Map<
        string,
        { name: string; count: number; quantity: number }
      >();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lotToFaction = new Map<string, { id: string; name: string }>();
      for (const s of shipments) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const f = s.factions as any;
        const name = Array.isArray(f) ? f[0]?.name : f?.name;
        lotToFaction.set(s.lot_id, {
          id: s.faction_id,
          name: name || "—",
        });
      }

      for (const d of defects) {
        const faction = lotToFaction.get(d.lot_id);
        if (!faction) continue;
        const existing = factionMap.get(faction.id) || {
          name: faction.name,
          count: 0,
          quantity: 0,
        };
        existing.count++;
        existing.quantity += d.quantity || 0;
        factionMap.set(faction.id, existing);
      }

      for (const [faction_id, v] of Array.from(factionMap.entries())) {
        byFaction.push({
          faction_id,
          faction_name: v.name,
          count: v.count,
          quantity: v.quantity,
          percentage:
            totalQuantityDefective > 0
              ? (v.quantity / totalQuantityDefective) * 100
              : 0,
        });
      }
      byFaction.sort((a, b) => b.quantity - a.quantity);
    }
  }

  return {
    total_defects: defects.length,
    total_quantity_defective: totalQuantityDefective,
    total_pieces_produced: totalPiecesProduced,
    allowance_rate: Math.round(allowanceRate * 10000) / 10000,
    allowance_target: allowanceTarget,
    threshold_ratio: Math.round(thresholdRatio * 100) / 100,
    by_type: byType,
    by_responsible: byResponsible.slice(0, 10),
    by_faction: byFaction,
  };
}

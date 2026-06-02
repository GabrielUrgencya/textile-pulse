import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { hasPermission, type AppRole } from "@/lib/permissions";

export async function GET(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;
  const role = user.app_metadata?.role;

  if (!hasPermission(role as AppRole, "factions:view")) {
    return NextResponse.json({ error: "Forbidden: factions:view required" }, { status: 403 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  // Get defects that have a direct shipment → faction relationship
  let query = supabase
    .from("defect_records")
    .select("id, status, severity, shipment_id, faction_shipments(faction_id, factions(name))");

  if (from) query = query.gte("detected_at", from);
  if (to) query = query.lte("detected_at", to);

  const { data: records, error } = await query;

  if (error) {
    console.error("[quality/by-faction]", error);
    return NextResponse.json({ error: "Failed to fetch quality by faction" }, { status: 500 });
  }

  // Group by faction
  const factionMap = new Map<string, { name: string; total: number; contested: number }>();

  for (const r of records || []) {
    // Navigate the join: defect_records → faction_shipments → factions
    const shipment = r.faction_shipments as unknown as { faction_id: string; factions: { name: string } } | null;
    const faction = shipment?.factions;
    const factionId = shipment?.faction_id;

    if (!factionId || !faction) continue;

    const entry = factionMap.get(factionId) || { name: faction.name, total: 0, contested: 0 };
    entry.total++;
    if (r.status === "CONTESTED") entry.contested++;
    factionMap.set(factionId, entry);
  }

  const factions = Array.from(factionMap.entries())
    .map(([id, data]) => ({
      faction_id: id,
      name: data.name,
      total_defects: data.total,
      contestation_rate: data.total > 0 ? Math.round((data.contested / data.total) * 1000) / 10 : 0,
      rating: data.total === 0 ? "A" : data.total <= 5 ? "B" : data.total <= 15 ? "C" : "D",
    }))
    .sort((a, b) => b.total_defects - a.total_defects);

  return NextResponse.json({ data: factions });
}

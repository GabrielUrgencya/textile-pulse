import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateFactionSession } from "@/lib/faction-middleware";
import { dbError } from "@/lib/api-helpers";

/**
 * GET /api/faction/shipments/[id]/events — Timeline da remessa no portal
 * (épico Robustez F3). Só eventos com visible_to_faction=true, e só se a
 * remessa pertence à facção da sessão (404 caso contrário).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await validateFactionSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Posse: a remessa precisa ser da facção da sessão.
  const { data: shipment } = await supabase
    .from("faction_shipments")
    .select("id")
    .eq("id", id)
    .eq("faction_id", session.factionId)
    .maybeSingle();

  if (!shipment) {
    return NextResponse.json({ error: "Remessa não encontrada" }, { status: 404 });
  }

  const { data: events, error } = await supabase
    .from("shipment_events")
    .select("id, event_type, actor_type, actor_name, payload, created_at")
    .eq("shipment_id", id)
    .eq("visible_to_faction", true)
    .order("created_at", { ascending: true });

  if (error) return dbError("GET /api/faction/shipments/[id]/events", error);

  return NextResponse.json({ data: events || [] });
}

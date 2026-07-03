import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { dbError } from "@/lib/api-helpers";
import { can } from "@/lib/effective-permissions";
import { computeFactionRanking } from "@/lib/faction-ranking";

/**
 * Story 8.33 — GET /api/ranking
 * Retorna TODAS as facções ranqueadas (score desc), com photo_url. Sem cortar top-N.
 */
export async function GET() {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  // Story 9.x: permissão dinâmica ranking:view (defesa no servidor, não só na UI)
  if (!can(user, "ranking:view")) {
    return NextResponse.json({ error: "Forbidden: ranking:view required" }, { status: 403 });
  }

  const tenantId = user.app_metadata?.tenant_id;
  if (!tenantId) return NextResponse.json({ error: "User has no tenant_id" }, { status: 403 });

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [factionsResult, shipmentsResult] = await Promise.all([
    supabase
      .from("factions")
      .select("id, name, photo_url, is_active")
      .eq("tenant_id", tenantId)
      .eq("is_active", true),
    supabase
      .from("faction_shipments")
      .select(
        `faction_id, quantity_sent, quantity_returned, quantity_defective,
         expected_return_at, actual_return_at, status, factions!inner ( tenant_id )`,
      )
      .eq("factions.tenant_id", tenantId)
      .gte("sent_at", since),
  ]);

  if (factionsResult.error) return dbError("GET /api/ranking factions", factionsResult.error);
  if (shipmentsResult.error) return dbError("GET /api/ranking shipments", shipmentsResult.error);

  const ranking = computeFactionRanking(factionsResult.data || [], shipmentsResult.data || []);
  return NextResponse.json({ data: ranking });
}

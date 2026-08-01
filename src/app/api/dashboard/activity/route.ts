import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { dbError } from "@/lib/api-helpers";

/**
 * GET /api/dashboard/activity?limit=10
 * Returns the latest scan events for the activity feed.
 */
export async function GET(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase } = auth;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit")) || 10, 50);

  const { data: events, error } = await supabase
    .from("scan_events")
    .select(`
      id, scanned_at, event_type,
      lots!inner ( barcode ),
      stages ( display_name ),
      profiles ( full_name )
    `).is("disregarded_at", null)
    .order("scanned_at", { ascending: false })
    .limit(limit);

  if (error) return dbError("GET /api/dashboard/activity", error);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activity = (events || []).map((ev: any) => {
    const lot = ev.lots as { barcode: string } | null;
    const stage = ev.stages as { display_name: string } | null;
    const profile = ev.profiles as { full_name: string } | null;

    const scannedAt = new Date(ev.scanned_at);
    const time = scannedAt.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    return {
      time,
      operator_name: profile?.full_name || "Operador",
      action: ev.event_type || "scan",
      barcode: lot?.barcode || "—",
      stage_name: stage?.display_name || "—",
    };
  });

  return NextResponse.json({ activity });
}

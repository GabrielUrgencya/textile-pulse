import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { dbError } from "@/lib/api-helpers";

/**
 * GET /api/dashboard/stale-lots
 * Returns lots that have been sitting in the same stage for > 2 hours.
 * Reuses the kiosk stale-lot query pattern with authenticated user context.
 */
export async function GET() {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase } = auth;

  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  const { data: lots, error } = await supabase
    .from("lots")
    .select(`
      barcode, lot_number, entered_current_stage_at, status,
      stages!lots_current_stage_id_fkey ( display_name ),
      production_orders!inner ( op_number )
    `)
    .lt("entered_current_stage_at", twoHoursAgo)
    .not("status", "in", "(CREATED,IN_STOCK,PARTIALLY_STOCKED)")
    .not("current_stage_id", "is", null)
    .limit(20);

  if (error) return dbError("GET /api/dashboard/stale-lots", error);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const staleLots = (lots || []).map((lot: any) => {
    const enteredAt = new Date(lot.entered_current_stage_at);
    const hoursStalled =
      Math.round(((Date.now() - enteredAt.getTime()) / (1000 * 60 * 60)) * 10) / 10;

    const stage = lot.stages as { display_name: string } | null;
    const po = lot.production_orders as { op_number: string } | null;

    return {
      barcode: lot.barcode,
      lot_number: lot.lot_number,
      op_number: po?.op_number || "—",
      stage_name: stage?.display_name || "—",
      hours_stalled: hoursStalled,
    };
  }).sort((a: { hours_stalled: number }, b: { hours_stalled: number }) =>
    b.hours_stalled - a.hours_stalled
  );

  return NextResponse.json({ stale_lots: staleLots });
}

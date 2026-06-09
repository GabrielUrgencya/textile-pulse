import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { requireTenantId } from "@/lib/api-helpers";
import { computeKpis, computeChartData } from "@/lib/kpi-queries";

/**
 * GET /api/dashboard/all?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Consolidated endpoint — returns ALL dashboard data in 1 request.
 * Replaces 7 separate API calls (kpis, chart, orders, targets, stale-lots, activity, profile).
 * Internally uses Promise.all to parallelize all queries.
 */
export async function GET(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;

  const { searchParams } = new URL(request.url);
  const today = new Date().toISOString().slice(0, 10);
  const from = searchParams.get("from") || today;
  const to = searchParams.get("to") || today;

  const groupBy = from === to ? "hour" : "day";
  const t = requireTenantId(user);
  if (t.error) return t.error;
  const tenantId = t.tenantId;
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  // Pre-fetch tenant settings to determine weighted meta mode (Story 8.1)
  const tenantSettingsResult = tenantId
    ? await supabase.from("tenants").select("settings").eq("id", tenantId).single()
    : { data: null };
  const tenantSettings = (tenantSettingsResult.data?.settings as Record<string, unknown>) || {};
  const useWeightedMeta = tenantSettings.use_weighted_meta !== false; // default: true

  // Run ALL queries in parallel — 1 withAuth() instead of 7
  const [
    kpisResult,
    chartResult,
    ordersResult,
    staleLotsResult,
    activityResult,
    profileResult,
  ] = await Promise.all([
    // 1. KPIs (uses RPCs internally — already optimized)
    computeKpis(supabase, { from, to, useWeightedMeta }).catch(() => null),

    // 2. Chart data (uses RPC internally)
    computeChartData(supabase, { from, to }, groupBy).catch(() => []),

    // 3. Recent orders (limit 10)
    supabase
      .from("production_orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10),

    // 4. Stale lots (> 2h in same stage)
    supabase
      .from("lots")
      .select(`
        barcode, lot_number, entered_current_stage_at, status,
        stages!lots_current_stage_id_fkey ( display_name ),
        production_orders!inner ( op_number )
      `)
      .lt("entered_current_stage_at", twoHoursAgo)
      .not("status", "in", "(CREATED,IN_STOCK,PARTIALLY_STOCKED)")
      .not("current_stage_id", "is", null)
      .limit(20),

    // 6. Activity feed (last 10 events)
    supabase
      .from("scan_events")
      .select(`
        id, scanned_at, event_type,
        lots!inner ( barcode ),
        stages ( display_name ),
        profiles ( full_name )
      `)
      .order("scanned_at", { ascending: false })
      .limit(10),

    // 7. User profile
    supabase
      .from("profiles")
      .select("full_name, role, sector, phone, email, avatar_url")
      .eq("id", user.id)
      .single(),
  ]);

  // --- Map targets ---
  const DEFAULTS = {
    dailyPiecesTarget: 1000,
    productivityTarget: 85,
    defectTolerance: 3,
    lotsTarget: 100,
    opsTarget: 15,
    shiftStart: "07:00",
    shiftEnd: "17:00",
  };
  // Use pre-fetched tenant settings (already fetched for weighted meta check)
  const settings = tenantSettings;
  const targets = {
    dailyPiecesTarget: (settings.dailyPiecesTarget as number) ?? DEFAULTS.dailyPiecesTarget,
    productivityTarget: (settings.productivityTarget as number) ?? DEFAULTS.productivityTarget,
    defectTolerance: (settings.defectTolerance as number) ?? DEFAULTS.defectTolerance,
    lotsTarget: (settings.lotsTarget as number) ?? DEFAULTS.lotsTarget,
    opsTarget: (settings.opsTarget as number) ?? DEFAULTS.opsTarget,
    shiftStart: (settings.shiftStart as string) ?? DEFAULTS.shiftStart,
    shiftEnd: (settings.shiftEnd as string) ?? DEFAULTS.shiftEnd,
  };

  // --- Map stale lots ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const staleLots = (staleLotsResult.data || []).map((lot: any) => {
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

  // --- Map activity ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activity = (activityResult.data || []).map((ev: any) => {
    const lot = ev.lots as { barcode: string } | null;
    const stage = ev.stages as { display_name: string } | null;
    const profile = ev.profiles as { full_name: string } | null;
    const scannedAt = new Date(ev.scanned_at);
    const time = scannedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return {
      time,
      operator_name: profile?.full_name || "Operador",
      action: ev.event_type || "scan",
      barcode: lot?.barcode || "—",
      stage_name: stage?.display_name || "—",
    };
  });

  // --- Map profile ---
  const profileData = profileResult.data;
  const fullName = profileData?.full_name || user.email?.split("@")[0] || "Usuário";
  const role = profileData?.role || "OPERADOR";
  const initials = fullName
    .split(" ")
    .filter(Boolean)
    .map((w: string) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return NextResponse.json({
    kpis: kpisResult,
    chart: chartResult,
    orders: ordersResult.data || [],
    targets,
    staleLots,
    activity,
    profile: {
      id: user.id,
      fullName,
      role,
      initials,
      email: user.email || profileData?.email || "",
      sector: profileData?.sector || null,
      phone: profileData?.phone || null,
      avatarUrl: profileData?.avatar_url || null,
    },
    period: { from, to },
  });
}

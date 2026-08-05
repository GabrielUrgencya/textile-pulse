import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateKioskToken } from "@/lib/kiosk-middleware";
import { todayInTz, localDayStart, localDayEnd } from "@/lib/tz";
import { computeSectorKpis } from "@/lib/sector-kpis";
import { listDayAchievements } from "@/lib/achievements";
import { getSectorDashboardConfig } from "@/lib/dashboard-config";
import { PORTAL_ACTIVE_STATUSES } from "@/lib/shipment-status";

/**
 * GET /api/kiosk/dashboard?token=<uuid>
 *
 * Andon Board API — returns all data needed for the TV dashboard:
 * production (hero), KPIs, pipeline, alerts, activity ticker, faction ranking.
 *
 * No Supabase Auth session — uses service_role with tenant filter.
 * All queries run in parallel via Promise.all() for performance.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  const session = await validateKioskToken(token);
  if (!session) {
    return NextResponse.json(
      { error: "Invalid or revoked kiosk token" },
      { status: 401 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const now = new Date();
  // Story 8.29 / fix de fuso: o "dia" da TV segue o fuso do tenant (como o
  // dashboard via kpi-queries), NÃO UTC. Sem isso, TV e dashboard divergiam ~3h
  // perto da virada do dia.
  const today = todayInTz();
  const fromStart = localDayStart(today);
  const toEnd = localDayEnd(today);

  // Yesterday for trend comparison (também no fuso do tenant)
  const yesterdayStr = (() => {
    const d = new Date(`${today}T12:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();
  const yesterdayStart = localDayStart(yesterdayStr);
  const yesterdayEnd = localDayEnd(yesterdayStr);

  // 1 hour ago for current rate
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

  // 2 hours ago for stale lot warning threshold
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();

  // 30 days ago for faction ranking
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const tenantId = session.tenantId;

  // Épico Metas/KPIs por Setor: filtro opcional por setor (= stage). Sem stage_id → visão geral (retrocompatível).
  const stageIdParam = searchParams.get("stage_id");

  // ─── Fetch tenant settings first (needed for shift detection) ────
  const tenantResult = await supabase
    .from("tenants")
    .select("settings")
    .eq("id", tenantId)
    .single();

  const settings = (tenantResult.data?.settings as Record<string, unknown>) || {};
  const dailyTarget = (settings.dailyPiecesTarget as number) || (settings.daily_target as number) || 500;
  const opsTarget = (settings.opsTarget as number) || 15;
  const lotsTarget = (settings.lotsTarget as number) || 100;
  const defectTolerance = (settings.defectTolerance as number) || 3;
  const shiftStart = (settings.shiftStart as string) || "07:00";
  const shiftEnd = (settings.shiftEnd as string) || "17:00";
  const useWeightedMeta = settings.use_weighted_meta !== false;

  // ─── Shift detection (Story 8.12) ──────────────────────────────
  interface ShiftConfig { name: string; start: string; end: string }
  const shiftsConfig = (settings.shifts as ShiftConfig[]) || [];
  const wantShift = searchParams.get("shift") === "current";

  let activeShiftName: string | null = null;
  let effectiveStart = fromStart;
  let effectiveEnd = toEnd;

  if (wantShift && shiftsConfig.length > 0) {
    const nowHHMM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const found = shiftsConfig.find((s) => nowHHMM >= s.start && nowHHMM < s.end);
    if (found) {
      activeShiftName = found.name;
      const [sh, sm] = found.start.split(":").map(Number);
      const [eh, em] = found.end.split(":").map(Number);
      const shiftStartDate = new Date(now);
      shiftStartDate.setHours(sh, sm, 0, 0);
      const shiftEndDate = new Date(now);
      shiftEndDate.setHours(eh, em, 0, 0);
      effectiveStart = shiftStartDate.toISOString();
      effectiveEnd = shiftEndDate.toISOString();
    }
    // If not found → between shifts → use full day (fromStart/toEnd)
  }

  // ─── Parallel queries ─────────────────────────────────────────────
  const [
    scansYesterdayResult,
    scansLastHourResult,
    scansHourlyResult,
    activeOpsResult,
    activeLotsResult,
    defectsTodayResult,
    stagesResult,
    lotsWithStageResult,
    staleLotResult,
    overdueShipmentsResult,
    recentActivityResult,
    factionsResult,
    factionShipmentsResult,
    weightedScansResult,
    stageEventsResult,
  ] = await Promise.all([
    // Scans yesterday (count for trend). Story 8.18: só STAGE_IN
    supabase
      .from("scan_events")
      .select("id, lots!inner(production_orders!inner(tenant_id))", {
        count: "exact",
        head: true,
      }).is("disregarded_at", null)
      .eq("lots.production_orders.tenant_id", tenantId)
      .eq("event_type", "STAGE_IN")
      .neq("lots.production_orders.status", "CANCELLED")
      .gte("scanned_at", yesterdayStart)
      .lte("scanned_at", yesterdayEnd),

    // Scans in last hour (current rate). Story 8.18: só STAGE_IN
    supabase
      .from("scan_events")
      .select("id, lots!inner(production_orders!inner(tenant_id))", {
        count: "exact",
        head: true,
      }).is("disregarded_at", null)
      .eq("lots.production_orders.tenant_id", tenantId)
      .eq("event_type", "STAGE_IN")
      .neq("lots.production_orders.status", "CANCELLED")
      .gte("scanned_at", oneHourAgo),

    // Scans today grouped by hour (for peak rate calculation). Story 8.18: só STAGE_IN
    supabase
      .from("scan_events")
      .select("scanned_at, lots!inner(production_orders!inner(tenant_id))").is("disregarded_at", null)
      .eq("lots.production_orders.tenant_id", tenantId)
      .eq("event_type", "STAGE_IN")
      .neq("lots.production_orders.status", "CANCELLED")
      .gte("scanned_at", effectiveStart)
      .lte("scanned_at", effectiveEnd)
      .order("scanned_at", { ascending: true }),

    // Active OPs count
    supabase
      .from("production_orders")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "active"),

    // Active lots count (not in terminal status)
    supabase
      .from("lots")
      .select("id, production_orders!inner(tenant_id, status)", {
        count: "exact",
        head: true,
      })
      .eq("production_orders.tenant_id", tenantId)
      .neq("production_orders.status", "CANCELLED")
      .not("status", "in", "(CREATED,IN_STOCK,PARTIALLY_STOCKED)"),

    // Defects today (count)
    supabase
      .from("defect_records")
      .select("quantity")
      .gte("detected_at", fromStart)
      .lte("detected_at", toEnd),

    // All stages for this tenant (for pipeline display)
    supabase
      .from("stages")
      .select("id, name, display_name, order_index, color")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("order_index", { ascending: true }),

    // Lots with current stage (for lots_by_stage grouping)
    supabase
      .from("lots")
      .select("current_stage_id, production_orders!inner(tenant_id, status)")
      .eq("production_orders.tenant_id", tenantId)
      .neq("production_orders.status", "CANCELLED")
      .not("current_stage_id", "is", null)
      .not("status", "in", "(CREATED,IN_STOCK,PARTIALLY_STOCKED)"),

    // Stale lots: entered current stage > 2h ago
    supabase
      .from("lots")
      .select(
        `
        id, barcode, entered_current_stage_at, status,
        stages!lots_current_stage_id_fkey ( display_name ),
        production_orders!inner ( op_number, tenant_id, status )
      `
      )
      .eq("production_orders.tenant_id", tenantId)
      .neq("production_orders.status", "CANCELLED")
      .lt("entered_current_stage_at", twoHoursAgo)
      .not("status", "in", "(CREATED,IN_STOCK,PARTIALLY_STOCKED)")
      .not("current_stage_id", "is", null),

    // Overdue faction shipments — só remessas AINDA EM ABERTO (peças com a facção).
    // Whitelist (PORTAL_ACTIVE_STATUSES), não blacklist: uma remessa CLOSED/RETURNED
    // não pode estar "atrasada no retorno" — o ciclo dela acabou. A lista escrita à
    // mão que existia aqui ignorava CLOSED (alarmava remessa encerrada, inclusive
    // devolvida ANTES do prazo) e excluía PARTIALLY_RETURNED (silenciava remessa com
    // peças realmente fora). Derivar da fonte de verdade evita a divergência voltar;
    // se surgir um status novo de conclusão, a whitelist não o inclui por acidente.
    supabase
      .from("faction_shipments")
      .select(
        `
        id, expected_return_at, status,
        factions!inner ( name, tenant_id )
      `
      )
      .eq("factions.tenant_id", tenantId)
      .lt("expected_return_at", now.toISOString())
      .in("status", [...PORTAL_ACTIVE_STATUSES]),

    // Recent activity: last 10 scan events
    supabase
      .from("scan_events")
      .select(
        `
        scanned_at,
        lots!inner (
          barcode,
          production_orders!inner ( tenant_id )
        ),
        stages ( display_name ),
        profiles ( full_name )
      `
      ).is("disregarded_at", null)
      .eq("lots.production_orders.tenant_id", tenantId)
      .neq("lots.production_orders.status", "CANCELLED")
      .order("scanned_at", { ascending: false })
      .limit(10),

    // Factions for ranking
    supabase
      .from("factions")
      .select("id, name, is_active")
      .eq("tenant_id", tenantId)
      .eq("is_active", true),

    // Faction shipments last 30 days (for ranking calculation)
    supabase
      .from("faction_shipments")
      .select(
        `
        faction_id, quantity_sent, quantity_returned, quantity_defective,
        expected_return_at, actual_return_at, status,
        factions!inner ( tenant_id )
      `
      )
      .eq("factions.tenant_id", tenantId)
      .gte("sent_at", thirtyDaysAgo),

    // Story 8.19: peças que ENTRARAM NO ESTOQUE no período (produção por peça, conta lote 1x)
    supabase
      .from("scan_events")
      .select(`
        lot_id,
        stages!inner ( name ),
        lots!inner (
          quantity,
          production_orders!inner ( meta_coefficient, tenant_id, status )
        )
      `).is("disregarded_at", null)
      .eq("lots.production_orders.tenant_id", tenantId)
      .neq("lots.production_orders.status", "CANCELLED")
      .eq("stages.name", "ESTOQUE")
      .eq("event_type", "STAGE_OUT")
      .gte("scanned_at", effectiveStart)
      .lte("scanned_at", effectiveEnd),

    // Story 8.18: eventos IN/OUT (últimos 30d) p/ tempo médio por etapa na TV
    supabase
      .from("scan_events")
      .select("lot_id, stage_id, event_type, scanned_at, lots!inner(production_orders!inner(tenant_id, status))").is("disregarded_at", null)
      .eq("lots.production_orders.tenant_id", tenantId)
      .neq("lots.production_orders.status", "CANCELLED")
      .in("event_type", ["STAGE_IN", "STAGE_OUT"])
      .not("stage_id", "is", null)
      .gte("scanned_at", thirtyDaysAgo)
      .order("scanned_at", { ascending: true }),
  ]);

  // ─── Produção por peça na entrada do estoque (Story 8.19) ───────
  // Cada lote conta uma vez (dedupe por lot_id). weightedPieces aplica coeficiente.
  let producedPieces = 0;
  let weightedPieces = 0;
  if (weightedScansResult.data && weightedScansResult.data.length > 0) {
    const seenLots = new Set<string>();
    for (const scan of weightedScansResult.data) {
      const lotId = scan.lot_id as string;
      if (seenLots.has(lotId)) continue;
      seenLots.add(lotId);
      const lotRel = scan.lots as unknown;
      const lot = (Array.isArray(lotRel) ? lotRel[0] : lotRel) as {
        quantity: number | string | null;
        production_orders: { meta_coefficient: string | number | null } | { meta_coefficient: string | number | null }[];
      } | null;
      const qty = Number(lot?.quantity) || 0;
      const poRel = lot?.production_orders;
      const po = (Array.isArray(poRel) ? poRel[0] : poRel) as { meta_coefficient: string | number | null } | null;
      const coeff = Number(po?.meta_coefficient) || 1.0;
      producedPieces += qty;
      weightedPieces += qty * coeff;
    }
    weightedPieces = Math.round(weightedPieces * 10) / 10;
  }

  // ─── Production calculations ──────────────────────────────────────
  const producedToday = useWeightedMeta ? weightedPieces : producedPieces;
  const percent = dailyTarget > 0 ? Math.round((producedToday / dailyTarget) * 100) : 0;
  const currentRate = scansLastHourResult.count ?? 0;

  // Peak rate: group scans by hour, find max
  let peakRate = 0;
  if (scansHourlyResult.data && scansHourlyResult.data.length > 0) {
    const hourBuckets = new Map<number, number>();
    for (const scan of scansHourlyResult.data) {
      const hour = new Date(scan.scanned_at).getHours();
      hourBuckets.set(hour, (hourBuckets.get(hour) || 0) + 1);
    }
    peakRate = Math.max(...Array.from(hourBuckets.values()), 0);
  }

  // Projected end of shift (use active shift times if available)
  const projShiftStart = activeShiftName
    ? shiftsConfig.find((s) => s.name === activeShiftName)?.start || shiftStart
    : shiftStart;
  const projShiftEnd = activeShiftName
    ? shiftsConfig.find((s) => s.name === activeShiftName)?.end || shiftEnd
    : shiftEnd;
  const [shiftStartH, shiftStartM] = projShiftStart.split(":").map(Number);
  const [shiftEndH, shiftEndM] = projShiftEnd.split(":").map(Number);
  const shiftTotalMinutes = (shiftEndH * 60 + shiftEndM) - (shiftStartH * 60 + shiftStartM);
  const shiftStartToday = new Date(now);
  shiftStartToday.setHours(shiftStartH, shiftStartM, 0, 0);
  const elapsedMinutes = Math.max(0, (now.getTime() - shiftStartToday.getTime()) / 60000);
  const projectedEnd =
    elapsedMinutes > 0 && shiftTotalMinutes > 0
      ? Math.round((producedToday / elapsedMinutes) * shiftTotalMinutes)
      : 0;

  // ─── KPIs ─────────────────────────────────────────────────────────
  const scansToday = producedToday;
  const scansYesterday = scansYesterdayResult.count ?? 0;
  const activeOps = activeOpsResult.count ?? 0;
  const activeLots = activeLotsResult.count ?? 0;

  // Defect rate: sum of defect quantities today / scans today
  let totalDefectQuantity = 0;
  if (defectsTodayResult.data) {
    for (const d of defectsTodayResult.data) {
      totalDefectQuantity += (d.quantity as number) || 0;
    }
  }
  const defectRate = scansToday > 0
    ? Math.round((totalDefectQuantity / scansToday) * 1000) / 10
    : 0;

  // ─── Lots by stage (pipeline) ─────────────────────────────────────
  // Build a map of stage_id -> count from lots data
  const stageCounts = new Map<string, number>();
  if (lotsWithStageResult.data) {
    for (const lot of lotsWithStageResult.data) {
      const stageId = lot.current_stage_id as string;
      stageCounts.set(stageId, (stageCounts.get(stageId) || 0) + 1);
    }
  }

  // Map to full stage info from stages query
  const lotsByStage = (stagesResult.data || []).map((stage) => ({
    stage_name: stage.name as string,
    display_name: (stage.display_name as string) || (stage.name as string),
    count: stageCounts.get(stage.id as string) || 0,
    order_index: stage.order_index as number,
    color: (stage.color as string) || "#888",
  }));

  // ─── Alerts ───────────────────────────────────────────────────────
  interface Alert {
    type: "stale_lot" | "overdue_shipment";
    severity: "critical" | "warning";
    barcode?: string;
    op_number?: string;
    stage_name?: string;
    hours_stalled?: number;
    faction_name?: string;
    expected_return_at?: string;
    days_overdue?: number;
  }

  const alerts: Alert[] = [];

  // Stale lots alerts
  if (staleLotResult.data) {
    for (const lot of staleLotResult.data) {
      const enteredAt = new Date(lot.entered_current_stage_at as string);
      const hoursStalled =
        Math.round(((now.getTime() - enteredAt.getTime()) / (1000 * 60 * 60)) * 10) / 10;

      const stageRel = lot.stages as unknown;
      const stage = (Array.isArray(stageRel) ? stageRel[0] : stageRel) as { display_name: string } | null;
      const poRel = lot.production_orders as unknown;
      const po = (Array.isArray(poRel) ? poRel[0] : poRel) as { op_number: string } | null;

      alerts.push({
        type: "stale_lot",
        severity: hoursStalled >= 4 ? "critical" : "warning",
        barcode: lot.barcode as string,
        op_number: po?.op_number || "—",
        stage_name: stage?.display_name || "—",
        hours_stalled: hoursStalled,
      });
    }
  }

  // Overdue shipment alerts
  if (overdueShipmentsResult.data) {
    for (const shipment of overdueShipmentsResult.data) {
      const expectedReturn = new Date(shipment.expected_return_at as string);
      const daysOverdue = Math.round(
        (now.getTime() - expectedReturn.getTime()) / (1000 * 60 * 60 * 24)
      );

      const factionRel = shipment.factions as unknown;
      const faction = (Array.isArray(factionRel) ? factionRel[0] : factionRel) as { name: string } | null;

      alerts.push({
        type: "overdue_shipment",
        severity: "warning",
        faction_name: faction?.name || "—",
        expected_return_at: shipment.expected_return_at as string,
        days_overdue: daysOverdue,
      });
    }
  }

  // Sort: critical first, then by hours_stalled/days_overdue desc. Limit to 5.
  alerts.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
    const aTime = a.hours_stalled ?? (a.days_overdue ?? 0) * 24;
    const bTime = b.hours_stalled ?? (b.days_overdue ?? 0) * 24;
    return bTime - aTime;
  });
  const topAlerts = alerts.slice(0, 5);

  // ─── Recent activity (ticker) ─────────────────────────────────────
  interface ActivityItem {
    barcode: string;
    stage_name: string;
    operator_name: string;
    scanned_at: string;
  }

  const recentActivity: ActivityItem[] = (recentActivityResult.data || []).map(
    (event) => {
      const lotRel = event.lots as unknown;
      const lot = (Array.isArray(lotRel) ? lotRel[0] : lotRel) as { barcode: string } | null;
      const stageRel = event.stages as unknown;
      const stage = (Array.isArray(stageRel) ? stageRel[0] : stageRel) as { display_name: string } | null;
      const profileRel = event.profiles as unknown;
      const profile = (Array.isArray(profileRel) ? profileRel[0] : profileRel) as { full_name: string } | null;

      return {
        barcode: lot?.barcode || "—",
        stage_name: stage?.display_name || "—",
        operator_name: profile?.full_name || "—",
        scanned_at: event.scanned_at as string,
      };
    }
  );

  // ─── Faction ranking ──────────────────────────────────────────────
  interface FactionRankEntry {
    id: string;
    name: string;
    initials: string;
    avatar_url: string | null;
    score: number;
    punctuality: number;
    quality: number;
    volume: number;
    deliveries_count: number;
  }

  const factionRanking: FactionRankEntry[] = [];

  if (factionsResult.data && factionShipmentsResult.data) {
    const factionMap = new Map<
      string,
      { name: string; onTime: number; total: number; sent: number; returned: number; defective: number }
    >();

    // Initialize all factions
    for (const f of factionsResult.data) {
      factionMap.set(f.id as string, {
        name: f.name as string,
        onTime: 0,
        total: 0,
        sent: 0,
        returned: 0,
        defective: 0,
      });
    }

    // Aggregate shipment data (count ALL shipments, not just returned)
    for (const s of factionShipmentsResult.data) {
      const fId = s.faction_id as string;
      const data = factionMap.get(fId);
      if (!data) continue;

      data.sent += (s.quantity_sent as number) || 0;
      data.returned += (s.quantity_returned as number) || 0;
      data.defective += (s.quantity_defective as number) || 0;

      // Count returned/partially returned as completed deliveries
      const status = s.status as string;
      if (status === "RETURNED" || status === "PARTIALLY_RETURNED") {
        data.total++;
        // On time if returned before or on expected date
        if (s.actual_return_at && s.expected_return_at) {
          const actual = new Date(s.actual_return_at as string);
          const expected = new Date(s.expected_return_at as string);
          if (actual <= expected) {
            data.onTime++;
          }
        }
      }
    }

    // Find max returned for volume normalization (use sent if no returns yet)
    let maxReturned = 0;
    let maxSent = 0;
    for (const data of Array.from(factionMap.values())) {
      if (data.returned > maxReturned) maxReturned = data.returned;
      if (data.sent > maxSent) maxSent = data.sent;
    }
    const volumeBase = maxReturned > 0 ? maxReturned : maxSent;

    // Calculate scores — include ALL active factions
    for (const [factionId, data] of Array.from(factionMap.entries())) {
      const punctuality = data.total > 0 ? (data.onTime / data.total) * 100 : 0;
      const quality = data.sent > 0 ? 100 - (data.defective / data.sent) * 100 : 100;
      const volume = volumeBase > 0
        ? ((data.returned > 0 ? data.returned : data.sent) / volumeBase) * 100
        : 0;

      // Factions with no completed deliveries: weight shifts to quality+volume
      const score = data.total > 0
        ? Math.round((punctuality * 0.4 + quality * 0.35 + volume * 0.25) * 10) / 10
        : Math.round((quality * 0.6 + volume * 0.4) * 10) / 10;

      // Generate initials from faction name
      const words = data.name.split(/\s+/);
      const initials =
        words.length >= 2
          ? (words[0][0] + words[1][0]).toUpperCase()
          : data.name.slice(0, 2).toUpperCase();

      factionRanking.push({
        id: factionId,
        name: data.name,
        initials,
        avatar_url: null,
        score,
        punctuality: Math.round(punctuality * 10) / 10,
        quality: Math.round(quality * 10) / 10,
        volume: Math.round(volume * 10) / 10,
        deliveries_count: data.total,
      });
    }

    // Sort by score desc, take top 3
    factionRanking.sort((a, b) => b.score - a.score);
    factionRanking.splice(3);
  }

  // ─── Tempo médio por etapa (Story 8.18) ──────────────────────────
  // Pareia STAGE_IN→STAGE_OUT por lote+etapa (n-ésimo com n-ésimo) e calcula média.
  interface StageEventRow { lot_id: string; stage_id: string; event_type: string; scanned_at: string }
  const stageDurationAgg = new Map<string, { totalHours: number; samples: number }>();
  if (stageEventsResult.data) {
    const openByKey = new Map<string, string[]>(); // lot|stage -> queue de scanned_at de IN
    for (const ev of stageEventsResult.data as unknown as StageEventRow[]) {
      const key = `${ev.lot_id}|${ev.stage_id}`;
      if (ev.event_type === "STAGE_IN") {
        const q = openByKey.get(key) || [];
        q.push(ev.scanned_at);
        openByKey.set(key, q);
      } else if (ev.event_type === "STAGE_OUT") {
        const q = openByKey.get(key);
        if (q && q.length > 0) {
          const inAt = q.shift()!;
          const hours = (new Date(ev.scanned_at).getTime() - new Date(inAt).getTime()) / 3_600_000;
          if (hours >= 0) {
            const agg = stageDurationAgg.get(ev.stage_id) || { totalHours: 0, samples: 0 };
            agg.totalHours += hours;
            agg.samples += 1;
            stageDurationAgg.set(ev.stage_id, agg);
          }
        }
      }
    }
  }
  const stageNameById = new Map<string, string>(
    (stagesResult.data || []).map((s) => [s.id as string, (s.display_name as string) || (s.name as string)])
  );
  const avgStageDurations = Array.from(stageDurationAgg.entries())
    .map(([stageId, agg]) => ({
      stage_id: stageId,
      stage_name: stageNameById.get(stageId) || "—",
      avg_hours: Math.round((agg.totalHours / agg.samples) * 100) / 100,
      samples: agg.samples,
    }))
    .sort((a, b) => b.avg_hours - a.avg_hours);

  // ─── Setor ativo + KPIs por setor (Stories 8.34/8.35) ────────────
  // Lista de stages p/ o seletor da TV (deriva do stagesResult já consultado).
  const sectors = (stagesResult.data || []).map((s) => ({
    id: s.id as string,
    name: s.name as string,
    display_name: (s.display_name as string) || (s.name as string),
    order_index: s.order_index as number,
  }));

  // Valida stage_id pertencente ao tenant; se inválido/ausente → visão geral.
  const activeStage = stageIdParam ? sectors.find((s) => s.id === stageIdParam) : undefined;
  const activeSector = activeStage
    ? { id: activeStage.id, name: activeStage.display_name }
    : null;
  const sectorKpis = activeStage
    ? await computeSectorKpis(supabase, tenantId, activeStage.id).catch(() => null)
    : null;

  // Story 8.40: layout de widgets do setor (salvo|default) — 1 request por poll.
  const dashboardConfig = activeStage
    ? await getSectorDashboardConfig(supabase, tenantId, activeStage.id).catch(() => null)
    : null;

  // Celebrações do dia p/ a TV enfileirar (Story 8.36) — best-effort.
  const achievementsToday = await listDayAchievements(supabase, tenantId).catch(() => []);

  // ─── Response ─────────────────────────────────────────────────────
  return NextResponse.json({
    tenant_id: tenantId,
    sectors,
    active_sector: activeSector,
    sector_kpis: sectorKpis,
    dashboard_config: dashboardConfig,
    achievements_today: achievementsToday,
    kiosk: {
      token_name: session.tokenName,
      scope: session.scope,
    },
    shift: {
      start: shiftStart,
      end: shiftEnd,
      active_shift: activeShiftName,
    },
    production: {
      produced_today: producedToday,
      daily_target: dailyTarget,
      percent,
      current_rate: currentRate,
      peak_rate: peakRate,
      projected_end: projectedEnd,
      use_weighted_meta: useWeightedMeta,
    },
    kpis: {
      active_ops: activeOps,
      ops_target: opsTarget,
      active_lots: activeLots,
      lots_target: lotsTarget,
      defect_rate: defectRate,
      defect_tolerance: defectTolerance,
      scans_today: scansToday,
      scans_yesterday: scansYesterday,
    },
    lots_by_stage: lotsByStage,
    avg_stage_durations: avgStageDurations,
    alerts: topAlerts,
    recent_activity: recentActivity,
    faction_ranking: factionRanking,
    timestamp: now.toISOString(),
  });
}

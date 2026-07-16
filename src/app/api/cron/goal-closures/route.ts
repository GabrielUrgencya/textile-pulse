import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { computeUserMeta } from "@/lib/user-meta";
import { prevWeekStart, prevMonthStart, getActiveSectorDeficit } from "@/lib/goal-deficits";
import { prevWorkingDay, parseCalendar } from "@/lib/work-calendar";

/**
 * GET /api/cron/goal-closures — Fechamento de metas acumulativas (épico Metas).
 * Roda diariamente (00:30 América/SP). Idempotente (upsert ignoreDuplicates).
 *
 * Frente 2 — PROCESSA POR TENANT respeitando o CALENDÁRIO DE TRABALHO de cada
 * empresa (settings.work_days): o dia fechado = último dia útil DAQUELE tenant, então
 * sábado/domingo (ou feriado) não geram dívida para quem não opera nesses dias.
 * Param opcional ?tenant=<id|slug> processa só aquele tenant (permite rodar isolado).
 *
 * REUSA computeUserMeta (usuário) e a mesma métrica de computeSectorKpis (setor):
 * STAGE_OUT ponderado, OPs canceladas excluídas, meta efetiva com cadeia de déficit.
 */

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function lastDayOfMonth(monthStart: string): string {
  const y = Number(monthStart.slice(0, 4));
  const m = Number(monthStart.slice(5, 7));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${monthStart.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

interface ClosureRow {
  tenant_id: string;
  user_id: string;
  period_type: "daily" | "weekly" | "monthly";
  period_reference: string;
  base_goal: number;
  produced: number;
  deficit: number;
  carried_to: string;
}

interface SectorClosureRow {
  tenant_id: string;
  user_id: null;
  stage_id: string;
  scope: "SECTOR";
  period_type: "daily";
  period_reference: string;
  base_goal: number;
  produced: number;
  deficit: number;
  carried_to: string;
}

/** Produção ponderada de um SETOR num dia local (STAGE_OUT, dedupe por lote,
 *  ponderado por reference_stage_targets, OPs canceladas excluídas). */
async function sectorProducedOn(stageId: string, day: string): Promise<number> {
  const { data: coeffs } = await supabaseAdmin
    .from("reference_stage_targets")
    .select("reference, coefficient")
    .eq("stage_id", stageId);
  const cMap = new Map<string, number>(
    (coeffs || []).map((c) => [String(c.reference), Number(c.coefficient) || 1]),
  );
  const { data } = await supabaseAdmin
    .from("scan_events")
    .select("lot_id, lots!inner(quantity, production_orders!inner(reference, status))")
    .eq("stage_id", stageId)
    .eq("event_type", "STAGE_OUT")
    .neq("lots.production_orders.status", "CANCELLED")
    .gte("scanned_at", `${day}T00:00:00.000-03:00`)
    .lte("scanned_at", `${day}T23:59:59.999-03:00`);
  const seen = new Set<string>();
  let total = 0;
  for (const r of (data || []) as Array<{ lot_id: string; lots: unknown }>) {
    if (seen.has(r.lot_id)) continue;
    seen.add(r.lot_id);
    const lot = (Array.isArray(r.lots) ? r.lots[0] : r.lots) as {
      quantity?: number | string | null;
      production_orders?: unknown;
    } | null;
    const poRel = lot?.production_orders;
    const po = (Array.isArray(poRel) ? poRel[0] : poRel) as { reference: string | null } | null;
    total += (Number(lot?.quantity) || 0) * (cMap.get(po?.reference ?? "") ?? 1);
  }
  return Math.round(total * 10) / 10;
}

export async function GET(request: Request) {
  const headerSecret = request.headers.get("x-cron-secret");
  const bearer = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  const authorized =
    !!expected && (headerSecret === expected || bearer === `Bearer ${expected}`);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tenantParam = searchParams.get("tenant"); // id ou slug — opcional (escopa a 1 tenant)

  const today = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  const dow = new Date(`${today}T12:00:00.000Z`).getUTCDay();
  const isMonday = dow === 1;
  const isFirstOfMonth = today.endsWith("-01");

  // Tenants a processar (todos, ou só o do param)
  const { data: tenants } = await supabaseAdmin.from("tenants").select("id, slug, settings");
  const targetTenants = (tenants || []).filter(
    (t) => !tenantParam || t.id === tenantParam || t.slug === tenantParam,
  );
  if (tenantParam && targetTenants.length === 0) {
    return NextResponse.json({ error: "Tenant não encontrado", tenant: tenantParam }, { status: 404 });
  }

  // Usuários por tenant (com meta explícita OU setor definido)
  const [utRes, profRes] = await Promise.all([
    supabaseAdmin.from("user_targets").select("user_id, tenant_id"),
    supabaseAdmin.from("profiles").select("id, tenant_id, sector, role, is_active"),
  ]);
  const usersByTenant = new Map<string, Set<string>>();
  const add = (tenantId: string, userId: string) => {
    if (!usersByTenant.has(tenantId)) usersByTenant.set(tenantId, new Set());
    usersByTenant.get(tenantId)!.add(userId);
  };

  // ELEGIBILIDADE (fix da "dívida fantasma"): só acumula meta quem é chão de
  // fábrica de verdade — OPERADOR e ATIVO. Admin não produz (não tem meta de
  // produção) e operador desativado não produz mais, então cobrar meta deles
  // gera dívida crescente sem sentido. Caso real: um operador desativado
  // acumulava déficit todos os dias, e admins com `sector` preenchido só
  // escapavam por não existir etapa com o nome do setor administrativo.
  // A meta em si (base/teto) NÃO é alterada aqui — dívida de quem produz
  // abaixo do alvo é informação de gestão legítima.
  const profTenant = new Map<string, string>();
  const eligible = new Set<string>();
  for (const p of profRes.data || []) {
    profTenant.set(p.id as string, p.tenant_id as string);
    if (p.is_active !== true || p.role !== "OPERADOR") continue;
    eligible.add(p.id as string);
    if (p.sector != null) add(p.tenant_id as string, p.id as string);
  }
  for (const u of utRes.data || []) {
    if (!eligible.has(u.user_id as string)) continue; // admin/desativado: pula
    const tid = (u.tenant_id as string) || profTenant.get(u.user_id as string);
    if (tid) add(tid, u.user_id as string);
  }

  const rows: ClosureRow[] = [];
  const sectorRows: SectorClosureRow[] = [];
  const closed = { daily: 0, weekly: 0, monthly: 0 };

  for (const tenant of targetTenants) {
    const cal = parseCalendar(tenant.settings);
    const closedDay = prevWorkingDay(today, cal); // último dia útil DESTE tenant

    // ── Usuários do tenant ──
    const users = usersByTenant.get(tenant.id as string) || new Set<string>();
    for (const userId of Array.from(users)) {
      const dayMeta = await computeUserMeta(supabaseAdmin, userId, closedDay, closedDay).catch(() => null);
      if (dayMeta?.target && dayMeta.target > 0) {
        rows.push({
          tenant_id: tenant.id as string,
          user_id: userId,
          period_type: "daily",
          period_reference: closedDay,
          base_goal: Math.round(dayMeta.target),
          produced: Math.round(dayMeta.progress),
          deficit: Math.max(0, Math.round(dayMeta.target - dayMeta.progress)),
          carried_to: today,
        });
        closed.daily++;
      }

      if (isMonday) {
        const wkStart = prevWeekStart(today);
        const wkEnd = addDays(wkStart, 6);
        const wkMeta = await computeUserMeta(supabaseAdmin, userId, wkEnd, wkEnd).catch(() => null);
        const wkTarget = wkMeta?.weekly?.target;
        if (wkMeta && wkTarget && wkTarget > 0) {
          rows.push({
            tenant_id: tenant.id as string,
            user_id: userId,
            period_type: "weekly",
            period_reference: wkStart,
            base_goal: Math.round(wkTarget),
            produced: Math.round(wkMeta.weekly.progress),
            deficit: Math.max(0, Math.round(wkTarget - wkMeta.weekly.progress)),
            carried_to: today,
          });
          closed.weekly++;
        }
      }

      if (isFirstOfMonth) {
        const moStart = prevMonthStart(today);
        const moEnd = lastDayOfMonth(moStart);
        const moMeta = await computeUserMeta(supabaseAdmin, userId, moEnd, moEnd).catch(() => null);
        const moTarget = moMeta?.monthly?.target;
        if (moMeta && moTarget && moTarget > 0) {
          rows.push({
            tenant_id: tenant.id as string,
            user_id: userId,
            period_type: "monthly",
            period_reference: moStart,
            base_goal: Math.round(moTarget),
            produced: Math.round(moMeta.monthly.progress),
            deficit: Math.max(0, Math.round(moTarget - moMeta.monthly.progress)),
            carried_to: today,
          });
          closed.monthly++;
        }
      }
    }

    // ── Setores do tenant (fechamento diário) ──
    const { data: sectorTargets } = await supabaseAdmin
      .from("sector_targets")
      .select("stage_id, daily_target")
      .eq("tenant_id", tenant.id as string);
    for (const stg of sectorTargets || []) {
      if (stg.daily_target == null) continue;
      const stageId = stg.stage_id as string;
      const prior = await getActiveSectorDeficit(supabaseAdmin, tenant.id as string, stageId, closedDay, cal);
      const base = Math.round((stg.daily_target as number) + (prior.daily ?? 0));
      const produced = Math.round(await sectorProducedOn(stageId, closedDay));
      sectorRows.push({
        tenant_id: tenant.id as string,
        user_id: null,
        stage_id: stageId,
        scope: "SECTOR",
        period_type: "daily",
        period_reference: closedDay,
        base_goal: base,
        produced,
        deficit: Math.max(0, base - produced),
        carried_to: today,
      });
    }
  }

  if (rows.length > 0) {
    const { error } = await supabaseAdmin
      .from("goal_deficits")
      .upsert(rows, { onConflict: "user_id,period_type,period_reference", ignoreDuplicates: true });
    if (error) {
      return NextResponse.json({ error: error.message, attempted: rows.length, phase: "user" }, { status: 500 });
    }
  }
  if (sectorRows.length > 0) {
    const { error } = await supabaseAdmin
      .from("goal_deficits")
      .upsert(sectorRows, {
        onConflict: "tenant_id,stage_id,period_type,period_reference",
        ignoreDuplicates: true,
      });
    if (error) {
      return NextResponse.json({ error: error.message, attempted: sectorRows.length, phase: "sector" }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    closed,
    sectors: sectorRows.length,
    tenants: targetTenants.map((t) => t.slug),
  });
}

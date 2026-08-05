import type { SupabaseClient } from "@supabase/supabase-js";
import { localDayStart, localDayEnd, todayInTz } from "@/lib/tz";
import { getActiveDeficits, getActiveSectorDeficit, accumulatedGoal } from "@/lib/goal-deficits";
import { getTenantCalendar, workingDaysBetween } from "@/lib/work-calendar";
import { getProductionAggregates, stageProduced, userProduced } from "@/lib/production-aggregates";

/**
 * Frente 1 — Motor de dados do RELATÓRIO de produção.
 *
 * REUSA a mesma métrica das telas (não reinventa): produção = STAGE_OUT ponderado,
 * OPs CANCELADAS excluídas, janela LOCAL do tenant, dedupe por lote. Números batem
 * com dashboard (ESTOQUE) / TV de setor / meta do operador. Tudo escopado por tenant.
 *
 * ATINGIMENTO (Correção E2E): o `%` usa a META EFETIVA (base do período + déficit
 * acumulado vigente), o MESMO denominador da TV e das dashboards — um só conceito de
 * "% de atingimento" no sistema. `meta` exposta = efetiva; `deficit` fica no breakdown.
 * Multi-período: meta efetiva = (base × dias úteis) + déficit corrente (a dívida vigente).
 */

export interface SectorReportRow {
  stage_id: string;
  setor: string;
  meta: number; // meta EFETIVA do período = (base × dias úteis) + déficit acumulado
  realizado: number; // produção ponderada no período
  atingimento: number; // fração realizado/meta EFETIVA (mesmo denominador da TV/dashboard)
  deficit: number; // déficit acumulado vigente (goal_deficits SECTOR) — breakdown
}

export interface OperatorReportRow {
  user_id: string;
  operador: string;
  setor: string;
  meta: number;
  realizado: number;
  atingimento: number;
  deficit: number;
}

export interface ProductionReport {
  empresa: string;
  period: { from: string; to: string };
  generatedAt: string; // ISO
  resumo: {
    producao_total: number; // peças no ESTOQUE (mesma do dashboard)
    defeitos: number;
    meta_pct: number; // fração (realizado/meta agregado dos setores)
    deficit_total: number;
  };
  setores: SectorReportRow[];
  operadores: OperatorReportRow[];
  totais: { meta: number; realizado: number };
}

interface LotRel {
  quantity?: number | string | null;
  production_orders?: { reference?: string | null; meta_coefficient?: number | string | null; status?: string | null }
    | Array<{ reference?: string | null; meta_coefficient?: number | string | null; status?: string | null }>;
}
function pickLot(rel: unknown): LotRel | null {
  return (Array.isArray(rel) ? rel[0] : rel) as LotRel | null;
}
function pickPo(lot: LotRel | null) {
  const po = lot?.production_orders;
  return (Array.isArray(po) ? po[0] : po) as { reference?: string | null; meta_coefficient?: number | string | null } | null;
}

/** Σ ponderada por reference_stage_targets (dedupe por lote) de STAGE_OUT numa etapa/período. */
// Legacy row-by-row implementation retained for migration comparison only.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function stageWeightedProduction(
  supabase: SupabaseClient,
  stageId: string,
  from: string,
  to: string,
  userId?: string,
): Promise<number> {
  const { data: coeffs } = await supabase
    .from("reference_stage_targets")
    .select("reference, coefficient")
    .eq("stage_id", stageId);
  const cMap = new Map<string, number>((coeffs || []).map((c) => [String(c.reference), Number(c.coefficient) || 1]));

  let q = supabase
    .from("scan_events")
    .select("lot_id, lots!inner(quantity, production_orders!inner(reference, status))").is("disregarded_at", null)
    .eq("stage_id", stageId)
    .eq("event_type", "STAGE_OUT")
    .neq("lots.production_orders.status", "CANCELLED")
    .gte("scanned_at", localDayStart(from))
    .lte("scanned_at", localDayEnd(to));
  if (userId) q = q.eq("user_id", userId);
  const { data } = await q;

  const seen = new Set<string>();
  let total = 0;
  for (const r of (data || []) as Array<{ lot_id: string; lots: unknown }>) {
    if (seen.has(r.lot_id)) continue;
    seen.add(r.lot_id);
    const lot = pickLot(r.lots);
    const po = pickPo(lot);
    total += (Number(lot?.quantity) || 0) * (cMap.get(po?.reference ?? "") ?? 1);
  }
  return Math.round(total * 10) / 10;
}

/** Produção de peças que ENTRARAM no ESTOQUE (mesma métrica do card do dashboard). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function estoqueProduction(supabase: SupabaseClient, tenantId: string, from: string, to: string): Promise<number> {
  const { data: est } = await supabase
    .from("stages")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("name", "ESTOQUE")
    .limit(1)
    .maybeSingle();
  if (!est?.id) return 0;
  const { data } = await supabase
    .from("scan_events")
    .select("lot_id, lots!inner(quantity, production_orders!inner(meta_coefficient, status))").is("disregarded_at", null)
    .eq("stage_id", est.id)
    .eq("event_type", "STAGE_OUT")
    .neq("lots.production_orders.status", "CANCELLED")
    .gte("scanned_at", localDayStart(from))
    .lte("scanned_at", localDayEnd(to));
  const seen = new Set<string>();
  let total = 0;
  for (const r of (data || []) as Array<{ lot_id: string; lots: unknown }>) {
    if (seen.has(r.lot_id)) continue;
    seen.add(r.lot_id);
    const lot = pickLot(r.lots);
    const po = pickPo(lot);
    total += (Number(lot?.quantity) || 0) * (Number(po?.meta_coefficient) || 1);
  }
  return Math.round(total * 10) / 10;
}

export async function computeProductionReport(
  supabase: SupabaseClient,
  tenantId: string,
  from: string,
  to: string,
): Promise<ProductionReport> {
  const today = todayInTz();
  const cal = await getTenantCalendar(supabase, tenantId);
  const businessDays = Math.max(1, workingDaysBetween(from, to, cal));
  const aggregates = await getProductionAggregates(supabase, {
    tenantId,
    from: localDayStart(from),
    to: localDayEnd(to),
  });

  // Empresa
  const { data: tenant } = await supabase.from("tenants").select("name").eq("id", tenantId).maybeSingle();

  // Etapas do tenant + metas de setor
  const { data: sectorTargets } = await supabase
    .from("sector_targets")
    .select("stage_id, daily_target, stages!inner(display_name, name)")
    .eq("tenant_id", tenantId);

  const setores: SectorReportRow[] = [];
  for (const st of sectorTargets || []) {
    const stageRel = (Array.isArray(st.stages) ? st.stages[0] : st.stages) as { display_name?: string; name?: string } | null;
    const nome = stageRel?.display_name || stageRel?.name || "Setor";
    const base = Number(st.daily_target) || 0;
    const metaBase = base * businessDays;
    const realizado = stageProduced(aggregates, st.stage_id as string);
    const persisted = await getActiveSectorDeficit(supabase, tenantId, st.stage_id as string, today, cal);
    const deficit = Math.round(persisted.daily ?? 0);
    const meta = accumulatedGoal(metaBase, deficit); // meta EFETIVA (base do período + déficit)
    setores.push({
      stage_id: st.stage_id as string,
      setor: nome,
      meta,
      realizado,
      atingimento: meta > 0 ? Math.round((realizado / meta) * 1000) / 1000 : 0,
      deficit,
    });
  }
  setores.sort((a, b) => b.realizado - a.realizado);

  // Operadores produtivos: têm user_targets OU setor que casa etapa (tenant-scoped)
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, sector")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);
  const { data: userTargets } = await supabase
    .from("user_targets")
    .select("user_id, stage_id, daily_target")
    .eq("tenant_id", tenantId);
  const utByUser = new Map((userTargets || []).map((u) => [u.user_id as string, u]));

  // etapas por nome (para fallback de setor) — só do tenant
  const { data: stages } = await supabase.from("stages").select("id, name, display_name").eq("tenant_id", tenantId);
  const stageByName = new Map<string, { id: string; name: string; display_name: string }>(
    (stages || []).map((s) => [String(s.name).toUpperCase(), { id: s.id as string, name: s.name as string, display_name: (s.display_name as string) || (s.name as string) }]),
  );
  const sectorBaseByStage = new Map((sectorTargets || []).map((s) => [s.stage_id as string, Number(s.daily_target) || 0]));

  const operadores: OperatorReportRow[] = [];
  for (const p of profiles || []) {
    // resolve etapa do operador
    let stageId: string | null = null;
    let base: number | null = null;
    const ut = utByUser.get(p.id as string);
    if (ut) {
      stageId = ut.stage_id as string;
      base = ut.daily_target != null ? Number(ut.daily_target) : (sectorBaseByStage.get(stageId) ?? null);
    } else {
      const setor = (p.sector || "").trim().toUpperCase();
      const s = setor ? stageByName.get(setor) : undefined;
      if (s) { stageId = s.id; base = sectorBaseByStage.get(s.id) ?? null; }
    }
    if (!stageId || base == null) continue; // não-produtivo (sem meta) fica fora do relatório de operadores
    const stageRow = (stages || []).find((s) => s.id === stageId);
    const setorNome = (stageRow?.display_name as string) || (stageRow?.name as string) || "—";
    const realizado = userProduced(aggregates, stageId, p.id as string);
    const metaBase = base * businessDays;
    const persisted = await getActiveDeficits(supabase, p.id as string, today, cal);
    const deficit = Math.round(persisted.daily ?? 0);
    const meta = accumulatedGoal(metaBase, deficit); // meta EFETIVA (base do período + déficit)
    operadores.push({
      user_id: p.id as string,
      operador: (p.full_name as string) || "—",
      setor: setorNome,
      meta,
      realizado,
      atingimento: meta > 0 ? Math.round((realizado / meta) * 1000) / 1000 : 0,
      deficit,
    });
  }
  operadores.sort((a, b) => b.realizado - a.realizado);

  // Resumo
  const producao_total = Number(aggregates.stock.weighted) || 0;
  const { count: defeitos } = await supabase
    .from("defect_records")
    .select("id", { count: "exact", head: true })
    .gte("detected_at", localDayStart(from))
    .lte("detected_at", localDayEnd(to));
  const metaTotal = setores.reduce((s, r) => s + r.meta, 0);
  const realizadoTotal = setores.reduce((s, r) => s + r.realizado, 0);
  const deficitTotal = setores.reduce((s, r) => s + r.deficit, 0);

  return {
    empresa: (tenant?.name as string) || "Empresa",
    period: { from, to },
    generatedAt: new Date().toISOString(),
    resumo: {
      producao_total,
      defeitos: defeitos ?? 0,
      meta_pct: metaTotal > 0 ? Math.round((realizadoTotal / metaTotal) * 1000) / 1000 : 0,
      deficit_total: deficitTotal,
    },
    setores,
    operadores,
    totais: { meta: metaTotal, realizado: realizadoTotal },
  };
}

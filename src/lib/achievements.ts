import type { SupabaseClient } from "@supabase/supabase-js";
import { computeUserMeta } from "@/lib/user-meta";
import { TENANT_UTC_OFFSET, todayInTz } from "@/lib/tz";

/**
 * Épico Metas/KPIs por Setor — "feito do dia" (meta batida) idempotente.
 *
 * Grava em daily_achievements quando um colaborador (scope USER) ou um setor
 * inteiro (scope SECTOR) cruza a meta diária. O índice único do banco garante
 * 1 registro por (tenant, dia, scope, stage, user) — inserts duplicados
 * disparam 23505 e são ignorados (idempotência). Tudo é best-effort: NUNCA
 * deve quebrar a bipagem que o chamou.
 */

function dayStart(date: string) {
  return `${date}T00:00:00.000${TENANT_UTC_OFFSET}`;
}
function dayEnd(date: string) {
  return `${date}T23:59:59.999${TENANT_UTC_OFFSET}`;
}

/** Produção do setor hoje (ponderada, dedupe por lote) + meta diária. */
async function computeSectorProgress(
  supabase: SupabaseClient,
  tenantId: string,
  stageId: string,
  date: string,
): Promise<{ produced: number; dailyTarget: number | null }> {
  const [{ data: st }, { data: coeffs }, { data: scans }] = await Promise.all([
    supabase.from("sector_targets").select("daily_target").eq("tenant_id", tenantId).eq("stage_id", stageId).maybeSingle(),
    supabase.from("reference_stage_targets").select("reference, coefficient").eq("stage_id", stageId),
    supabase.from("scan_events")
      .select("lot_id, lots!inner(quantity, production_orders!inner(reference, tenant_id))")
      .eq("stage_id", stageId).eq("event_type", "STAGE_IN")
      .neq("lots.production_orders.status", "CANCELLED")
      .gte("scanned_at", dayStart(date)).lte("scanned_at", dayEnd(date)),
  ]);

  const coeffMap = new Map<string, number>((coeffs || []).map((c) => [String(c.reference), Number(c.coefficient) || 1.0]));
  let produced = 0;
  const seen = new Set<string>();
  for (const s of (scans || []) as Array<{ lot_id: string; lots: unknown }>) {
    if (seen.has(s.lot_id)) continue;
    seen.add(s.lot_id);
    const lotRel = s.lots;
    const lot = (Array.isArray(lotRel) ? lotRel[0] : lotRel) as {
      quantity: number | string | null;
      production_orders: { reference: string | null } | { reference: string | null }[];
    } | null;
    const qty = Number(lot?.quantity) || 0;
    const poRel = lot?.production_orders;
    const po = (Array.isArray(poRel) ? poRel[0] : poRel) as { reference: string | null } | null;
    produced += qty * (coeffMap.get(po?.reference ?? "") ?? 1.0);
  }
  return { produced: Math.round(produced * 10) / 10, dailyTarget: (st?.daily_target as number) ?? null };
}

/** Insere um feito ignorando duplicidade (índice único → 23505 ignorado). */
async function insertAchievement(
  supabase: SupabaseClient,
  row: {
    tenant_id: string;
    achieved_date: string;
    scope: "USER" | "SECTOR";
    stage_id: string;
    user_id: string | null;
    target_snapshot: number | null;
    progress_snapshot: number | null;
  },
): Promise<void> {
  const { error } = await supabase.from("daily_achievements").insert(row);
  // 23505 = unique_violation → já registrado hoje, ok (idempotente)
  if (error && error.code !== "23505") {
    console.warn("[achievements] insert falhou:", error.code, error.message);
  }
}

/**
 * Avalia e grava os feitos do dia para uma bipagem (best-effort).
 * Chamado pelo /api/scan após um STAGE_IN. Envolver em try/catch no chamador.
 */
export async function evaluateAndRecordAchievements(
  supabase: SupabaseClient,
  params: { tenantId: string; userId: string; stageId: string },
): Promise<void> {
  const { tenantId, userId, stageId } = params;
  const today = todayInTz();

  // 1) Meta individual do colaborador (reusa 8.21)
  const userMeta = await computeUserMeta(supabase, userId, today, today).catch(() => null);
  if (userMeta && userMeta.target && userMeta.target > 0 && userMeta.progress >= userMeta.target) {
    await insertAchievement(supabase, {
      tenant_id: tenantId,
      achieved_date: today,
      scope: "USER",
      stage_id: userMeta.stage_id,
      user_id: userId,
      target_snapshot: userMeta.target,
      progress_snapshot: userMeta.progress,
    });
  }

  // 2) Meta do setor (etapa bipada)
  const sector = await computeSectorProgress(supabase, tenantId, stageId, today).catch(() => null);
  if (sector && sector.dailyTarget && sector.dailyTarget > 0 && sector.produced >= sector.dailyTarget) {
    await insertAchievement(supabase, {
      tenant_id: tenantId,
      achieved_date: today,
      scope: "SECTOR",
      stage_id: stageId,
      user_id: null,
      target_snapshot: sector.dailyTarget,
      progress_snapshot: sector.produced,
    });
  }
}

export interface DayAchievement {
  id: string;
  scope: "USER" | "SECTOR";
  name: string; // colaborador (USER) ou setor (SECTOR)
  achieved_at: string;
}

/**
 * Lista os feitos de HOJE do tenant (para a TV enfileirar celebrações).
 * Resolve o nome: USER → profiles.full_name; SECTOR → stages.display_name.
 */
export async function listDayAchievements(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<DayAchievement[]> {
  const today = todayInTz();
  const { data } = await supabase
    .from("daily_achievements")
    .select("id, scope, stage_id, user_id, created_at")
    .eq("tenant_id", tenantId)
    .eq("achieved_date", today)
    .order("created_at", { ascending: true });

  const rows = (data || []) as Array<{ id: string; scope: "USER" | "SECTOR"; stage_id: string; user_id: string | null; created_at: string }>;
  if (rows.length === 0) return [];

  const userIds = Array.from(new Set(rows.filter((r) => r.scope === "USER" && r.user_id).map((r) => r.user_id as string)));
  const stageIds = Array.from(new Set(rows.filter((r) => r.scope === "SECTOR").map((r) => r.stage_id)));

  const [profilesRes, stagesRes] = await Promise.all([
    userIds.length ? supabase.from("profiles").select("id, full_name").in("id", userIds) : Promise.resolve({ data: [] }),
    stageIds.length ? supabase.from("stages").select("id, display_name, name").in("id", stageIds) : Promise.resolve({ data: [] }),
  ]);
  const nameByUser = new Map<string, string>((profilesRes.data || []).map((p: { id: string; full_name: string }) => [p.id, p.full_name]));
  const nameByStage = new Map<string, string>(
    (stagesRes.data || []).map((s: { id: string; display_name: string | null; name: string }) => [s.id, s.display_name || s.name]),
  );

  return rows.map((r) => ({
    id: r.id,
    scope: r.scope,
    name: r.scope === "USER" ? (nameByUser.get(r.user_id as string) || "Colaborador") : (nameByStage.get(r.stage_id) || "Setor"),
    achieved_at: r.created_at,
  }));
}

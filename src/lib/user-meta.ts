import type { SupabaseClient } from "@supabase/supabase-js";

export interface UserMeta {
  stage_id: string;
  stage_name: string;
  target: number | null;
  unit: string | null;
  progress: number;
  percent: number;
}

/**
 * Story 8.21 — Meta personalizada do usuário logado (por setor/etapa).
 *
 * Resolve a etapa do usuário:
 *   1) user_targets (atribuição explícita do admin) — prevalece;
 *   2) fallback: profiles.sector casando com stages.name.
 *
 * Meta = user_targets.daily_target ?? sector_targets.daily_target.
 * Unidade = user_targets.unit ?? sector_targets.unit.
 * Progresso = Σ (lots.quantity × coeficiente[referência][etapa]) das bipagens
 *             STAGE_IN do usuário na sua etapa, no período.
 */
export async function computeUserMeta(
  supabase: SupabaseClient,
  userId: string,
  from: string,
  to: string,
): Promise<UserMeta | null> {
  const fromStart = `${from}T00:00:00.000Z`;
  const toEnd = `${to}T23:59:59.999Z`;

  // 1) Override explícito do usuário
  const { data: ut } = await supabase
    .from("user_targets")
    .select("stage_id, daily_target, unit")
    .eq("user_id", userId)
    .maybeSingle();

  let stageId: string | null = ut?.stage_id ?? null;
  let target: number | null = ut?.daily_target ?? null;
  let unit: string | null = ut?.unit ?? null;

  // 2) Fallback por setor do perfil
  if (!stageId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("sector")
      .eq("id", userId)
      .maybeSingle();
    const sector = (profile?.sector || "").trim();
    if (sector) {
      const { data: stage } = await supabase
        .from("stages")
        .select("id")
        .ilike("name", sector)
        .maybeSingle();
      stageId = stage?.id ?? null;
    }
  }

  if (!stageId) return null;

  // Nome da etapa
  const { data: stageRow } = await supabase
    .from("stages")
    .select("name, display_name")
    .eq("id", stageId)
    .maybeSingle();
  const stageName = (stageRow?.display_name as string) || (stageRow?.name as string) || "Setor";

  // Completa meta/unidade pelo sector_target quando faltar no override
  if (target === null || unit === null) {
    const { data: st } = await supabase
      .from("sector_targets")
      .select("daily_target, unit")
      .eq("stage_id", stageId)
      .maybeSingle();
    if (target === null) target = (st?.daily_target as number) ?? null;
    if (unit === null) unit = (st?.unit as string) ?? null;
  }

  // Coeficientes por referência para a etapa
  const { data: coeffs } = await supabase
    .from("reference_stage_targets")
    .select("reference, coefficient")
    .eq("stage_id", stageId);
  const coeffMap = new Map<string, number>(
    (coeffs || []).map((c) => [String(c.reference), Number(c.coefficient) || 1.0]),
  );

  // Bipagens STAGE_IN do usuário na etapa, no período
  const { data: scans } = await supabase
    .from("scan_events")
    .select("lots!inner(quantity, production_orders!inner(reference))")
    .eq("user_id", userId)
    .eq("stage_id", stageId)
    .eq("event_type", "STAGE_IN")
    .gte("scanned_at", fromStart)
    .lte("scanned_at", toEnd);

  let progress = 0;
  for (const s of scans || []) {
    const lotRel = (s as { lots: unknown }).lots;
    const lot = (Array.isArray(lotRel) ? lotRel[0] : lotRel) as {
      quantity: number | string | null;
      production_orders: { reference: string | null } | { reference: string | null }[];
    } | null;
    const qty = Number(lot?.quantity) || 0;
    const poRel = lot?.production_orders;
    const po = (Array.isArray(poRel) ? poRel[0] : poRel) as { reference: string | null } | null;
    const ref = po?.reference ?? "";
    const coef = coeffMap.get(ref) ?? 1.0;
    progress += qty * coef;
  }
  progress = Math.round(progress * 10) / 10;

  const percent = target && target > 0 ? Math.round((progress / target) * 1000) / 10 : 0;

  return { stage_id: stageId, stage_name: stageName, target, unit, progress, percent };
}

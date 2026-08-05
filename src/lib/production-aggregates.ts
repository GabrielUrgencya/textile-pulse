import type { SupabaseClient } from "@supabase/supabase-js";

export interface ProductionAggregates {
  stage_totals: Array<{ stage_id: string; produced: number | string; lots: number | string }>;
  user_totals: Array<{ stage_id: string; user_id: string | null; full_name: string | null; produced: number | string; lots: number | string }>;
  hourly_stage: Array<{ stage_id: string; hour_local: number | string; produced: number | string }>;
  stage_timing: Array<{ stage_id: string; first_in_at: string | null; avg_per_lot_min: number | string | null }>;
  user_timing: Array<{ stage_id: string; user_id: string | null; first_in_at: string | null; avg_per_lot_min: number | string | null }>;
  stock: { pieces: number | string; weighted: number | string };
}

export async function getProductionAggregates(
  supabase: SupabaseClient,
  params: { tenantId: string; from: string; to: string; stageId?: string | null; userId?: string | null },
): Promise<ProductionAggregates> {
  const { data, error } = await supabase.rpc("production_aggregates_v1", {
    p_tenant_id: params.tenantId,
    p_from: params.from,
    p_to: params.to,
    p_stage_id: params.stageId ?? null,
    p_user_id: params.userId ?? null,
    p_timezone: "America/Sao_Paulo",
  });
  if (error) throw new Error(`production_aggregates_v1 failed: ${error.message}`);
  if (!data || typeof data !== "object" || !Array.isArray((data as ProductionAggregates).stage_totals)) {
    throw new Error("production_aggregates_v1 returned an invalid payload");
  }
  return data as ProductionAggregates;
}

export function stageProduced(data: ProductionAggregates, stageId: string): number {
  return Number(data.stage_totals.find((row) => row.stage_id === stageId)?.produced) || 0;
}

export function userProduced(data: ProductionAggregates, stageId: string, userId: string): number {
  return Number(data.user_totals.find((row) => row.stage_id === stageId && row.user_id === userId)?.produced) || 0;
}

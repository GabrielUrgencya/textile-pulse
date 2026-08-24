import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const decimal = z.union([
  z.number().finite(),
  z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/),
]);
const periodKey = z.string().regex(/^[0-9a-f]{64}$/);
const period = z
  .object({
    key: periodKey,
    starts_on: z.string(),
    ends_on: z.string(),
    status: z.enum(["OPEN", "CLOSED"]),
  })
  .strict();
const filters = z
  .object({
    period_key: periodKey.nullable(),
    month: z.number().nullable(),
    year: z.number().nullable(),
  })
  .strict();
const rankingItem = z
  .object({
    position: z.number(),
    label: z.string(),
    contribution_percent: decimal,
    tied: z.boolean(),
  })
  .strict();
const rankPage = z
  .object({
    minimum_team_size: z.number(),
    suppressed: z.boolean(),
    page: z.number(),
    page_size: z.number(),
    total: z.number(),
    items: z.array(rankingItem),
  })
  .strict();
const unavailable = z
  .object({
    allowed: z.literal(false),
    role: z.enum(["ADMIN", "CONSULTANT"]),
    available_periods: z.array(period),
    filters,
    seller_ranking: z
      .object({
        page: z.number(),
        page_size: z.number(),
        total: z.number(),
        items: z.array(z.never()),
      })
      .strict(),
  })
  .strict();
const goalKey = z.enum([
  "META_1",
  "META_2",
  "META_3",
  "CHALLENGE",
  "QUARTERLY",
  "COLLECTIVE",
]);
const goal = z
  .object({
    key: goalKey,
    label: z.string().min(1),
    available: z.boolean(),
    suppressed: z.boolean(),
    minimum_participants: z.number().int().positive().optional(),
    progress_percent: decimal.nullable(),
    ideal_pace_percent: decimal.nullable(),
    necessary_per_business_day_percent: decimal.nullable(),
  })
  .strict();
const sanitizedRank = z
  .object({
    position: z.number(),
    label: z.string(),
    sales_percent: decimal,
    suppressed: z.boolean(),
    tied: z.boolean().optional(),
  })
  .strict();
const available = z
  .object({
    allowed: z.literal(true),
    role: z.enum(["ADMIN", "CONSULTANT"]),
    period,
    available_periods: z.array(period),
    filters,
    pace: z
      .object({
        achieved_percent: decimal,
        ideal_pace_percent: decimal,
        necessary_per_business_day_percent: decimal,
        business_days_remaining: z.number(),
      })
      .strict(),
    goals: z.array(goal).length(6),
    aggregates: z
      .object({
        sales_count: z.union([z.number(), z.string()]),
        pieces_total: z.union([z.number(), z.string()]),
        freight_share_percent: decimal,
        // L1: presente após a migration _sales_collective_freight_total; opcional
        // para não quebrar antes de aplicá-la (forward-compatible).
        freight_total: decimal.optional(),
      })
      .strict(),
    installments: z
      .object({
        minimum_bucket_size: z.number().int().positive(),
        has_suppressed_buckets: z.boolean(),
        items: z.array(sanitizedRank),
      })
      .strict(),
    payment_methods: z
      .object({
        minimum_bucket_size: z.number(),
        has_suppressed_buckets: z.boolean(),
        items: z.array(sanitizedRank),
      })
      .strict(),
    seller_ranking: rankPage,
  })
  .strict();
const collectiveSchema = z.discriminatedUnion("allowed", [
  unavailable,
  available,
]);

export const collectiveQuerySchema = z
  .object({
    periodKey: periodKey.optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    year: z.coerce.number().int().min(2000).max(2200).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict()
  .refine((value) => value.month === undefined || value.year !== undefined, {
    path: ["year"],
  });
export type SalesCollective = z.infer<typeof collectiveSchema>;
export type CollectiveResult =
  | { data: SalesCollective; error: null }
  | { data: null; error: { code: string; message: string; status: number } };

function mapError(error: PostgrestError) {
  if (error.message.includes("sales_collective_access_denied"))
    return {
      code: "FORBIDDEN",
      message: "Painel coletivo indisponível.",
      status: 403,
    };
  if (error.message.includes("sales_collective_filter_validation"))
    return { code: "VALIDATION", message: "Filtros inválidos.", status: 400 };
  if (error.message.includes("sales_not_found_or_out_of_scope"))
    return {
      code: "NOT_FOUND",
      message: "Painel coletivo indisponível.",
      status: 404,
    };
  console.error("LISION Vendas collective RPC failed", { code: error.code });
  return {
    code: "SERVICE_UNAVAILABLE",
    message: "Painel coletivo temporariamente indisponível.",
    status: 503,
  };
}

export async function loadSalesCollective(
  supabase: SupabaseClient,
  query: z.infer<typeof collectiveQuerySchema>,
): Promise<CollectiveResult> {
  const { data, error } = await supabase.rpc("sales_collective_summary_v2", {
    p_period_key: query.periodKey ?? null,
    p_month: query.month ?? null,
    p_year: query.year ?? null,
    p_page: query.page,
    p_page_size: query.pageSize,
  });
  if (error) return { data: null, error: mapError(error) };
  const parsed = collectiveSchema.safeParse(data);
  return parsed.success
    ? { data: parsed.data, error: null }
    : {
        data: null,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Painel coletivo temporariamente indisponível.",
          status: 503,
        },
      };
}

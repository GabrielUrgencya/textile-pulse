import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const uuid = z.string().uuid();
const money = z.union([
  z.number().finite(),
  z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/),
]);
const saleStatus = z.enum(["OPEN", "CLOSED"]);

export const consultantFiltersSchema = z.object({
  period: uuid.optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2200).optional(),
  status: saleStatus.optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
}).strict();

export const consultantDashboardFiltersSchema = consultantFiltersSchema.omit({ status: true, page: true });

export const consultantSaleInputSchema = z.object({
  saleId: uuid.nullable(),
  pvNumber: z.string().trim().min(1).max(120),
  saleValue: z.number().finite().nonnegative(),
  freightValue: z.number().finite().nonnegative(),
  discountValue: z.number().finite().nonnegative(),
  paymentMethodId: uuid,
  installments: z.number().int().min(1).max(999),
  setsCount: z.number().int().min(0).max(1000000),
  loosePiecesCount: z.number().int().min(0).max(1000000),
  invoiceNumber: z.string().trim().max(120),
  status: saleStatus,
  soldAt: z.string().datetime({ offset: true }),
  expectedRevision: z.number().int().nonnegative().safe(),
  idempotencyKey: z.string().trim().min(16).max(200),
}).strict().refine((value) => value.discountValue <= value.saleValue, {
  path: ["discountValue"],
  message: "O desconto não pode superar o valor da venda.",
});

export const consultantCelebrationInputSchema = z.object({ periodId: uuid }).strict();

const saleSchema = z.object({
  id: uuid,
  pv_number: z.string(),
  sale_value: money,
  freight_value: money,
  discount_value: money,
  payment_method_id: uuid.nullable(),
  payment_method_name: z.string().nullable().optional(),
  payment_method: z.object({ id: uuid, name: z.string() }).nullable().optional(),
  installments: z.number(),
  sets_count: z.number(),
  loose_pieces_count: z.number(),
  pieces_total: z.number(),
  invoice_number: z.string().nullable(),
  status: saleStatus,
  sold_at: z.string(),
  revision: z.union([z.number(), z.string()]),
  period_id: uuid,
  period_status: z.enum(["OPEN", "CLOSED"]).optional(),
  starts_on: z.string().optional(),
  ends_on: z.string().optional(),
  period: z.object({ id: uuid, starts_on: z.string(), ends_on: z.string(), status: z.enum(["OPEN", "CLOSED"]) }).optional(),
  can_edit: z.boolean(),
});

const salesListSchema = z.object({
  items: z.array(saleSchema),
  page: z.number(),
  page_size: z.number(),
  total: z.union([z.number(), z.string()]),
  filters: z.record(z.string(), z.unknown()),
});

const dashboardSchema = z.object({
  period_id: uuid,
  available_periods: z.array(z.object({
    id: uuid,
    starts_on: z.string(),
    ends_on: z.string(),
    status: z.enum(["OPEN", "CLOSED"]),
  })),
  filters: z.record(z.string(), z.unknown()),
  realized: z.record(z.string(), z.unknown()),
  average_per_business_day: money,
  pipeline: z.object({ value: money, sales_count: z.union([z.number(), z.string()]), pieces_total: money, freight_total: money }),
  tickets: z.object({ sale: money, piece: money }),
  comparison: z.object({ current_month: money, previous_month: money, delta_value: money, delta_percent: money }),
  accumulated: z.object({ year: z.number(), realized_value: money }),
  quarterly: z.object({
    quarter: z.number().int().min(1).max(4), year: z.number().int(), starts_on: z.string(), ends_on: z.string(),
    realized_value: money, target_value: money, progress_percent: money,
    goals: z.array(z.object({ goal_id: uuid, name: z.string(), target_value: money, progress_percent: money, commission_percent: money, is_challenge: z.boolean(), sort_order: z.number() })),
  }),
  collective: z.discriminatedUnion("allowed", [
    z.object({ allowed: z.literal(false) }),
    z.object({ allowed: z.literal(true), target_value: money, realized_value: money, progress_percent: money }),
  ]),
});

const mutationSchema = z.object({
  sale: saleSchema,
  outcome: z.enum(["created", "updated", "replayed"]),
  revalidate: z.array(z.string()),
});

const celebrationSchema = z.object({
  claimed: z.boolean(), already_claimed: z.boolean(), status: z.string(), period_id: uuid,
  goal_id: uuid.optional(), goal_name: z.string().optional(), threshold_value: money.optional(),
  commission_percent: money.optional(), audience: z.literal("PRIVATE").optional(),
});

const paymentMethodSchema = z.object({ id: uuid, name: z.string().min(1), sort_order: z.number(), is_active: z.boolean() });

export type ConsultantSaleInput = z.infer<typeof consultantSaleInputSchema>;
export type ConsultantSale = z.infer<typeof saleSchema>;
export type ConsultantSalesList = z.infer<typeof salesListSchema>;
export type ConsultantDashboard = z.infer<typeof dashboardSchema>;
export type ConsultantCelebration = z.infer<typeof celebrationSchema>;
export type ConsultantPaymentMethod = { id: string; name: string };

export type ConsultantError = { code: string; message: string; status: number };
export type ConsultantResult<T> = { data: T; error: null } | { data: null; error: ConsultantError };

const ERROR_MAP: Record<string, ConsultantError> = {
  sales_consultant_required: { code: "FORBIDDEN", message: "Acesso restrito à área da consultora.", status: 403 },
  sales_filter_validation: { code: "VALIDATION", message: "Filtros inválidos.", status: 400 },
  sales_validation: { code: "VALIDATION", message: "Revise os dados da venda.", status: 400 },
  sales_not_found_or_out_of_scope: { code: "NOT_FOUND_OR_OUT_OF_SCOPE", message: "Venda indisponível.", status: 404 },
  sales_sale_not_found_or_locked: { code: "NOT_FOUND_OR_OUT_OF_SCOPE", message: "Venda indisponível.", status: 404 },
  sales_closed_period_or_not_found: { code: "CLOSED_PERIOD", message: "Somente leitura · período encerrado.", status: 409 },
  sales_stale_revision: { code: "STALE_REVISION", message: "A venda foi atualizada em outro lugar. Recarregue o estado atual.", status: 409 },
  sales_duplicate_pv: { code: "DUPLICATE_PV", message: "Já existe uma venda com este PV.", status: 409 },
  sales_payment_method_inactive_or_not_found: { code: "INVALID_PAYMENT_METHOD", message: "Forma de pagamento indisponível.", status: 422 },
  sales_idempotency_mismatch: { code: "IDEMPOTENCY_MISMATCH", message: "Esta tentativa já foi usada com outros dados.", status: 409 },
};

export function mapConsultantRpcError(error: PostgrestError): ConsultantError {
  const mapped = Object.entries(ERROR_MAP).find(([key]) => error.message.includes(key))?.[1];
  if (mapped) return mapped;
  console.error("LISION Vendas consultant RPC failed", { code: error.code, message: error.message });
  return { code: "SERVICE_UNAVAILABLE", message: "Os dados comerciais estão temporariamente indisponíveis.", status: 503 };
}

function invalidContract<T>(): ConsultantResult<T> {
  return { data: null, error: { code: "SERVICE_UNAVAILABLE", message: "Os dados comerciais estão temporariamente indisponíveis.", status: 503 } };
}

function parseRpc<T>(schema: z.ZodType<T>, data: unknown): ConsultantResult<T> {
  const parsed = schema.safeParse(data);
  return parsed.success ? { data: parsed.data, error: null } : invalidContract();
}

export async function loadConsultantSales(supabase: SupabaseClient, filters: z.infer<typeof consultantFiltersSchema>): Promise<ConsultantResult<ConsultantSalesList>> {
  const { data, error } = await supabase.rpc("sales_consultant_list_sales_v1", { p_period_id: filters.period ?? null, p_month: filters.month ?? null, p_year: filters.year ?? null, p_status: filters.status ?? null, p_page: filters.page, p_page_size: 25 });
  return error ? { data: null, error: mapConsultantRpcError(error) } : parseRpc(salesListSchema, data);
}

export async function loadConsultantSale(supabase: SupabaseClient, saleId: string): Promise<ConsultantResult<ConsultantSale>> {
  const { data, error } = await supabase.rpc("sales_consultant_sale_detail_v1", { p_sale_id: saleId });
  return error ? { data: null, error: mapConsultantRpcError(error) } : parseRpc(saleSchema, data);
}

export async function upsertConsultantSale(supabase: SupabaseClient, input: ConsultantSaleInput): Promise<ConsultantResult<z.infer<typeof mutationSchema>>> {
  const { data, error } = await supabase.rpc("sales_consultant_upsert_sale_v1", { p_sale_id: input.saleId, p_pv_number: input.pvNumber, p_sale_value: input.saleValue, p_freight_value: input.freightValue, p_discount_value: input.discountValue, p_payment_method_id: input.paymentMethodId, p_installments: input.installments, p_sets_count: input.setsCount, p_loose_pieces_count: input.loosePiecesCount, p_invoice_number: input.invoiceNumber, p_status: input.status, p_sold_at: input.soldAt, p_expected_revision: input.expectedRevision, p_idempotency_key: input.idempotencyKey });
  return error ? { data: null, error: mapConsultantRpcError(error) } : parseRpc(mutationSchema, data);
}

export async function loadConsultantDashboard(supabase: SupabaseClient, filters: z.infer<typeof consultantDashboardFiltersSchema>): Promise<ConsultantResult<ConsultantDashboard>> {
  const { data, error } = await supabase.rpc("sales_consultant_dashboard_v1", { p_period_id: filters.period ?? null, p_month: filters.month ?? null, p_year: filters.year ?? null });
  return error ? { data: null, error: mapConsultantRpcError(error) } : parseRpc(dashboardSchema, data);
}

export async function claimConsultantCelebration(supabase: SupabaseClient, periodId: string): Promise<ConsultantResult<ConsultantCelebration>> {
  const { data, error } = await supabase.rpc("sales_consultant_claim_celebration_v1", { p_period_id: periodId });
  return error ? { data: null, error: mapConsultantRpcError(error) } : parseRpc(celebrationSchema, data);
}

export async function loadConsultantPaymentMethods(supabase: SupabaseClient): Promise<ConsultantResult<ConsultantPaymentMethod[]>> {
  const { data, error } = await supabase.from("sales_payment_methods").select("id,name,sort_order,is_active").eq("is_active", true).order("sort_order");
  if (error) return { data: null, error: mapConsultantRpcError(error) };
  const parsed = z.array(paymentMethodSchema).safeParse(data);
  return parsed.success ? { data: parsed.data.map(({ id, name }) => ({ id, name })), error: null } : invalidContract();
}

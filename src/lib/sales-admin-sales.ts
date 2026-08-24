import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { SalesAdminResult } from "@/lib/sales-admin";
import { mapSalesAdminRpcError } from "@/lib/sales-admin";

const uuid = z.string().uuid();
const nullableUuid = uuid.nullable();
const money = z.union([z.number(), z.string()]);
const saleStatus = z.enum(["OPEN", "CLOSED", "CANCELLED"]);
const periodStatus = z.enum(["OPEN", "CLOSED"]);

export const salesDashboardQuerySchema = z.object({
  period: uuid,
  consultant: uuid.optional(),
}).strict();

export const salesListQuerySchema = z.object({
  period: uuid.optional(),
  consultant: uuid.optional(),
  status: saleStatus.optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  sort: z.enum(["sold_at", "pv_number", "sale_value", "status"]).default("sold_at"),
  direction: z.enum(["asc", "desc"]).default("desc"),
}).strict();

export const salesUpsertInputSchema = z.object({
  saleId: uuid.nullable(),
  consultantProfileId: uuid,
  pvNumber: z.string().trim().min(1).max(120),
  saleValue: z.number().finite().nonnegative(),
  freightValue: z.number().finite().nonnegative(),
  discountValue: z.number().finite().nonnegative(),
  paymentMethodId: nullableUuid,
  installments: z.number().int().min(1).max(999),
  setsCount: z.number().int().min(0).max(1000000),
  loosePiecesCount: z.number().int().min(0).max(1000000),
  invoiceNumber: z.string().trim().max(120),
  status: z.enum(["OPEN", "CLOSED"]),
  soldAt: z.string().datetime({ offset: true }),
  expectedRevision: z.number().int().nonnegative().safe(),
  idempotencyKey: z.string().trim().min(1).max(200),
}).strict().refine((value) => value.discountValue <= value.saleValue, {
  path: ["discountValue"], message: "O desconto não pode superar o valor da venda.",
});

export const salesCancelInputSchema = z.object({
  expectedRevision: z.number().int().nonnegative().safe(),
  reason: z.string().trim().min(3).max(500),
  idempotencyKey: z.string().trim().min(1).max(200),
}).strict();

// D1: exclusão definitiva (hard delete) — apenas ADM.
export const salesDeleteInputSchema = z.object({
  expectedRevision: z.number().int().nonnegative().safe(),
  idempotencyKey: z.string().trim().min(1).max(200),
}).strict();

const saleItemSchema = z.object({
  id: uuid,
  pv_number: z.string(),
  sale_value: money,
  freight_value: money,
  discount_value: money,
  payment_method_id: nullableUuid,
  installments: z.number(),
  sets_count: z.number(),
  loose_pieces_count: z.number(),
  pieces_total: z.number(),
  invoice_number: z.string().nullable(),
  status: saleStatus,
  sold_at: z.string(),
  revision: z.union([z.number(), z.string()]),
  consultant_profile_id: uuid,
  consultant_name: z.string().nullable(),
  period_id: uuid,
  period_status: periodStatus,
  starts_on: z.string(),
  ends_on: z.string(),
  cancelled_at: z.string().nullable(),
  cancellation_reason: z.string().nullable(),
  can_edit: z.boolean(),
  can_cancel: z.boolean(),
  ordinal: z.number().optional(),
}).strict();

const listSchema = z.object({
  items: z.array(saleItemSchema), page: z.number(), page_size: z.number(), total: z.union([z.number(), z.string()]),
  sort: z.string(), direction: z.enum(["asc", "desc"]), filters: z.record(z.string(), z.unknown()),
}).strict();

const installmentItemSchema = z.object({
  installments: z.number(),
  sales_count: z.union([z.number(), z.string()]),
  value: money,
}).strict();

const installmentsSchema = z.object({
  closed: z.array(installmentItemSchema),
  open: z.array(installmentItemSchema),
}).strict();

const dashboardSchema = z.object({
  period_id: uuid, consultant_profile_id: nullableUuid, realized: z.record(z.string(), z.unknown()),
  pipeline: z.object({ value: money, sales_count: z.union([z.number(), z.string()]), pieces_total: money, freight_total: money }).strict(),
  installments: installmentsSchema,
  tickets: z.object({ sale: money, piece: money }).strict(),
  ranking: z.array(z.object({ profile_id: uuid, display_name: z.string().nullable(), realized_value: money, sales_count: z.union([z.number(), z.string()]), position: z.union([z.number(), z.string()]) }).strict()),
}).strict();

export type SalesDashboard = z.infer<typeof dashboardSchema>;
export type SalesDashboardInstallments = z.infer<typeof installmentsSchema>;
export type SalesList = z.infer<typeof listSchema>;
export type SalesItem = z.infer<typeof saleItemSchema>;
export type SalesUpsertInput = z.infer<typeof salesUpsertInputSchema>;
export type SalesCancelInput = z.infer<typeof salesCancelInputSchema>;

function unavailable<T>(): SalesAdminResult<T> { return { data: null, error: { code: "SERVICE_UNAVAILABLE", message: "Os dados comerciais estão temporariamente indisponíveis.", status: 503 } }; }
function rpcError<T>(error: PostgrestError): SalesAdminResult<T> { return { data: null, error: mapSalesAdminRpcError(error) }; }

export async function loadSalesDashboard(supabase: SupabaseClient, query: z.infer<typeof salesDashboardQuerySchema>): Promise<SalesAdminResult<SalesDashboard>> {
  const { data, error } = await supabase.rpc("sales_admin_dashboard_v2", { p_period_id: query.period, p_consultant_profile_id: query.consultant ?? null });
  if (error) return rpcError(error); const parsed = dashboardSchema.safeParse(data); return parsed.success ? { data: parsed.data, error: null } : unavailable();
}

export async function loadSalesList(supabase: SupabaseClient, query: z.infer<typeof salesListQuerySchema>): Promise<SalesAdminResult<SalesList>> {
  const { data, error } = await supabase.rpc("sales_admin_list_sales_v1", { p_period_id: query.period ?? null, p_consultant_profile_id: query.consultant ?? null, p_status: query.status ?? null, p_page: query.page, p_page_size: 25, p_sort: query.sort, p_direction: query.direction });
  if (error) return rpcError(error); const parsed = listSchema.safeParse(data); return parsed.success ? { data: parsed.data, error: null } : unavailable();
}

export async function loadSalesDetail(supabase: SupabaseClient, saleId: string): Promise<SalesAdminResult<SalesItem>> {
  const { data, error } = await supabase.rpc("sales_admin_sale_detail_v1", { p_sale_id: saleId });
  if (error) return rpcError(error); const parsed = saleItemSchema.safeParse(data); return parsed.success ? { data: parsed.data, error: null } : unavailable();
}

export async function upsertSalesSale(supabase: SupabaseClient, input: SalesUpsertInput): Promise<SalesAdminResult<unknown>> {
  const { data, error } = await supabase.rpc("sales_admin_upsert_sale_v2", { p_sale_id: input.saleId, p_consultant_profile_id: input.consultantProfileId, p_pv_number: input.pvNumber, p_sale_value: input.saleValue, p_freight_value: input.freightValue, p_discount_value: input.discountValue, p_payment_method_id: input.paymentMethodId, p_installments: input.installments, p_sets_count: input.setsCount, p_loose_pieces_count: input.loosePiecesCount, p_invoice_number: input.invoiceNumber, p_status: input.status, p_sold_at: input.soldAt, p_expected_revision: input.expectedRevision, p_idempotency_key: input.idempotencyKey });
  return error ? rpcError(error) : { data, error: null };
}

export async function cancelSalesSale(supabase: SupabaseClient, saleId: string, input: SalesCancelInput): Promise<SalesAdminResult<unknown>> {
  const { data, error } = await supabase.rpc("sales_admin_cancel_sale_v2", { p_sale_id: saleId, p_expected_revision: input.expectedRevision, p_reason: input.reason, p_idempotency_key: input.idempotencyKey });
  return error ? rpcError(error) : { data, error: null };
}

export type SalesDeleteInput = z.infer<typeof salesDeleteInputSchema>;
export async function deleteSalesSale(supabase: SupabaseClient, saleId: string, input: SalesDeleteInput): Promise<SalesAdminResult<unknown>> {
  const { data, error } = await supabase.rpc("sales_admin_delete_sale_v1", { p_sale_id: saleId, p_expected_revision: input.expectedRevision, p_idempotency_key: input.idempotencyKey });
  return error ? rpcError(error) : { data, error: null };
}

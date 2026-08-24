import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { SalesAdminError, SalesAdminResult } from "@/lib/sales-admin";

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const salesClosePreviewInputSchema = z.object({
  periodId: uuid,
  nextStartsOn: date,
  nextEndsOn: date,
}).strict().refine((value) => value.nextEndsOn >= value.nextStartsOn, { path: ["nextEndsOn"] });

export const salesCloseCommitInputSchema = z.object({
  periodId: uuid,
  periodRevision: z.string().regex(/^[0-9a-f]{64}$/),
  nextStartsOn: date,
  nextEndsOn: date,
  idempotencyKey: z.string().trim().min(16).max(200),
}).strict().refine((value) => value.nextEndsOn >= value.nextStartsOn, { path: ["nextEndsOn"] });

export const salesCloseRecoveryInputSchema = z.object({
  idempotencyKey: z.string().trim().min(16).max(200),
}).strict();

export type SalesClosePreviewInput = z.infer<typeof salesClosePreviewInputSchema>;
export type SalesCloseCommitInput = z.infer<typeof salesCloseCommitInputSchema>;
export type SalesCloseRecoveryInput = z.infer<typeof salesCloseRecoveryInputSchema>;

export type SalesClosePreview = {
  periodId: string;
  periodRevision: string;
  period: { startsOn: string; endsOn: string; status: string };
  summary: Record<string, unknown>;
  nextPeriod: { mode: "existing" | "proposed"; id: string | null; startsOn: string; endsOn: string };
  blockers: Array<Record<string, unknown>>;
  canClose: boolean;
};

export type SalesCloseResult = {
  closedPeriodId: string;
  closureId: string;
  snapshot: Record<string, unknown>;
  nextPeriodId: string;
  nextPeriodCreated: boolean;
  closedAt: string;
  outcome: "created" | "replayed" | "converged";
  nextPeriodProgress: Record<string, unknown>;
};

export type SalesCloseRecovery =
  | { status: "failed-before-commit"; result: null }
  | { status: "committed"; result: SalesCloseResult };

type Row = Record<string, unknown>;
const row = (value: unknown): Row => (value && typeof value === "object" ? value as Row : {});
const text = (value: unknown) => typeof value === "string" ? value : "";

function previewFrom(value: unknown): SalesClosePreview {
  const data = row(value); const period = row(data.period); const next = row(data.next_period);
  return {
    periodId: text(data.period_id), periodRevision: text(data.period_revision),
    period: { startsOn: text(period.starts_on), endsOn: text(period.ends_on), status: text(period.status) },
    summary: row(data.summary),
    nextPeriod: { mode: next.mode === "existing" ? "existing" : "proposed", id: next.id ? text(next.id) : null, startsOn: text(next.starts_on), endsOn: text(next.ends_on) },
    blockers: Array.isArray(data.blockers) ? data.blockers.map(row) : [], canClose: data.can_close === true,
  };
}

function resultFrom(value: unknown): SalesCloseResult {
  const data = row(value);
  return {
    closedPeriodId: text(data.closed_period_id), closureId: text(data.closure_id), snapshot: row(data.snapshot),
    nextPeriodId: text(data.next_period_id), nextPeriodCreated: data.next_period_created === true,
    closedAt: text(data.closed_at), outcome: data.outcome === "replayed" ? "replayed" : data.outcome === "converged" ? "converged" : "created",
    nextPeriodProgress: row(data.next_period_progress),
  };
}

const knownErrors: Record<string, Omit<SalesAdminError, "details">> = {
  sales_next_period_not_empty: { code: "NEXT_PERIOD_NOT_EMPTY", message: "O próximo período já possui progresso comercial e não pode ser reutilizado.", status: 409 },
  sales_admin_required: { code: "FORBIDDEN", message: "Acesso restrito a administradores ativos.", status: 403 },
  sales_close_validation: { code: "INVALID_INPUT", message: "Os dados do fechamento são inválidos.", status: 400 },
  sales_next_period_must_follow_current: { code: "INVALID_NEXT_PERIOD", message: "O próximo período deve começar após o período atual.", status: 409 },
  sales_stale_preview: { code: "STALE_PREVIEW", message: "Os dados mudaram desde o preview. Atualize a revisão antes de confirmar.", status: 409 },
  sales_overlapping_period: { code: "OVERLAPPING_PERIOD", message: "As datas do próximo período se sobrepõem a outro período. Ajuste-as em Períodos.", status: 409 },
  sales_idempotency_mismatch: { code: "IDEMPOTENCY_MISMATCH", message: "Esta tentativa já está vinculada a outro fechamento.", status: 409 },
  sales_period_already_closed: { code: "PERIOD_ALREADY_CLOSED", message: "Este período já foi fechado e é somente leitura.", status: 409 },
  sales_not_found_or_out_of_scope: { code: "RESOURCE_NOT_FOUND", message: "Período indisponível para esta operação.", status: 404 },
};

function errorFrom(error: PostgrestError): SalesAdminError {
  const match = Object.entries(knownErrors).find(([key]) => error.message.includes(key))?.[1];
  if (match) return match;
  console.error("Sales period close RPC failed", { code: error.code, message: error.message });
  return { code: "SERVICE_UNAVAILABLE", message: "O fechamento está temporariamente indisponível.", status: 503 };
}
const failed = <T>(error: PostgrestError): SalesAdminResult<T> => ({ data: null, error: errorFrom(error) });
const ok = <T>(data: T): SalesAdminResult<T> => ({ data, error: null });

export async function previewSalesPeriodClose(supabase: SupabaseClient, input: SalesClosePreviewInput): Promise<SalesAdminResult<SalesClosePreview>> {
  const { data, error } = await supabase.rpc("sales_close_preview_v2", { p_period_id: input.periodId, p_next_starts_on: input.nextStartsOn, p_next_ends_on: input.nextEndsOn });
  return error ? failed(error) : ok(previewFrom(data));
}

export async function commitSalesPeriodClose(supabase: SupabaseClient, input: SalesCloseCommitInput): Promise<SalesAdminResult<SalesCloseResult>> {
  const { data, error } = await supabase.rpc("sales_close_period_v2", { p_period_id: input.periodId, p_expected_revision: input.periodRevision, p_next_starts_on: input.nextStartsOn, p_next_ends_on: input.nextEndsOn, p_idempotency_key: input.idempotencyKey });
  return error ? failed(error) : ok(resultFrom(data));
}

export async function recoverSalesPeriodClose(supabase: SupabaseClient, input: SalesCloseRecoveryInput): Promise<SalesAdminResult<SalesCloseRecovery>> {
  const { data, error } = await supabase.rpc("sales_close_recovery_v1", { p_idempotency_key: input.idempotencyKey });
  if (error) return failed(error);
  const recovered = row(data);
  return recovered.status === "committed" ? ok({ status: "committed", result: resultFrom(recovered.result) }) : ok({ status: "failed-before-commit", result: null });
}

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { SalesAdminError, SalesAdminResult } from "@/lib/sales-admin";

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const revision = z.number().int().nonnegative().safe();
const money = z.number().nonnegative().max(999999999999.99);

export const salesConfigInputSchema = z.object({
  piecesPerSet: z.number().int().min(1).max(1000), timezone: z.string().trim().min(1).max(100),
  weekStartsOn: z.number().int().min(0).max(6), allowTeamAggregates: z.boolean(), expectedRevision: revision,
}).strict();
export const salesHolidayInputSchema = z.object({
  holidayId: uuid.nullable().optional(), date, name: z.string().trim().min(1).max(120),
  isActive: z.boolean(), expectedRevision: revision,
}).strict();
export const salesPeriodInputSchema = z.object({
  periodId: uuid.nullable().optional(), startsOn: date, endsOn: date, expectedRevision: revision,
}).strict().refine((value) => value.endsOn >= value.startsOn, { path: ["endsOn"], message: "A data final deve ser posterior à inicial." });
export const salesGoalInputSchema = z.object({
  goalId: uuid.nullable().optional(), provisioningKey: z.enum(["META_1", "META_2", "META_3", "CHALLENGE", "QUARTERLY", "COLLECTIVE"]).nullable(),
  name: z.string().trim().min(1).max(120), scope: z.enum(["INDIVIDUAL", "COLLECTIVE", "QUARTERLY"]),
  targetValue: money, commissionPercent: z.number().min(0).max(100), sortOrder: z.number().int().nonnegative(),
  isChallenge: z.boolean(), isActive: z.boolean(), validFrom: date.nullable(), validUntil: date.nullable(), expectedRevision: revision,
}).strict().superRefine((value, context) => {
  if ((value.provisioningKey === "COLLECTIVE") !== (value.scope === "COLLECTIVE")) context.addIssue({ code: "custom", path: ["scope"], message: "Escopo incompatível com a identidade da meta." });
  if (value.validFrom && value.validUntil && value.validUntil < value.validFrom) context.addIssue({ code: "custom", path: ["validUntil"], message: "Vigência final inválida." });
});
export const salesGoalAssignmentInputSchema = z.object({
  assignmentId: uuid.nullable().optional(), goalId: uuid, periodId: uuid,
  profileId: uuid.nullable(), isActive: z.boolean(),
  targetOverride: money.nullable().optional(), commissionOverride: z.number().min(0).max(100).nullable().optional(),
  expectedRevision: revision,
}).strict();

export type SalesConfigInput = z.infer<typeof salesConfigInputSchema>;
export type SalesHolidayInput = z.infer<typeof salesHolidayInputSchema>;
export type SalesPeriodInput = z.infer<typeof salesPeriodInputSchema>;
export type SalesGoalInput = z.infer<typeof salesGoalInputSchema>;
export type SalesGoalAssignmentInput = z.infer<typeof salesGoalAssignmentInputSchema>;

export interface SalesConfigRecord { id: string; piecesPerSet: number; timezone: string; weekStartsOn: number; allowTeamAggregates: boolean; revision: number; }
export interface SalesHolidayRecord { id: string; date: string; name: string; isActive: boolean; revision: number; }
export interface SalesPeriodRecord { id: string; startsOn: string; endsOn: string; status: "OPEN" | "CLOSED"; revision: number; readOnlyReason: "CLOSED_PERIOD" | null; }
export type SalesGoalScope = "INDIVIDUAL" | "COLLECTIVE" | "QUARTERLY";
export interface SalesGoalRecord { id: string; provisioningKey: string | null; name: string; scope: SalesGoalScope; targetValue: number; commissionPercent: number; sortOrder: number; isChallenge: boolean; isActive: boolean; validFrom: string | null; validUntil: string | null; revision: number; }
export interface SalesGoalAssignmentRecord { id: string; goalId: string; periodId: string; profileId: string | null; targetValueSnapshot: number; commissionPercentSnapshot: number; targetOverride: number | null; commissionOverride: number | null; goalScopeSnapshot: SalesGoalScope; goalRevision: number; isActive: boolean; revision: number; }
export interface SalesAdminConfiguration { config: SalesConfigRecord | null; holidays: SalesHolidayRecord[]; periods: SalesPeriodRecord[]; goals: SalesGoalRecord[]; assignments: SalesGoalAssignmentRecord[]; }

type Row = Record<string, unknown>;
const num = (value: unknown) => typeof value === "number" ? value : Number(value);
const configFrom = (row: Row): SalesConfigRecord => ({ id: String(row.id), piecesPerSet: num(row.pieces_per_set), timezone: String(row.timezone), weekStartsOn: num(row.week_starts_on), allowTeamAggregates: row.allow_team_aggregates === true, revision: num(row.revision) });
const holidayFrom = (row: Row): SalesHolidayRecord => ({ id: String(row.id), date: String(row.date), name: String(row.name), isActive: row.is_active === true, revision: num(row.revision) });
const periodFrom = (row: Row): SalesPeriodRecord => ({ id: String(row.id), startsOn: String(row.starts_on), endsOn: String(row.ends_on), status: row.status === "CLOSED" ? "CLOSED" : "OPEN", revision: num(row.revision), readOnlyReason: row.read_only_reason === "CLOSED_PERIOD" ? "CLOSED_PERIOD" : null });
const scopeFrom = (value: unknown): SalesGoalScope => value === "COLLECTIVE" ? "COLLECTIVE" : value === "QUARTERLY" ? "QUARTERLY" : "INDIVIDUAL";
const goalFrom = (row: Row): SalesGoalRecord => ({ id: String(row.id), provisioningKey: row.provisioning_key ? String(row.provisioning_key) : null, name: String(row.name), scope: scopeFrom(row.scope), targetValue: num(row.target_value), commissionPercent: num(row.commission_percent), sortOrder: num(row.sort_order), isChallenge: row.is_challenge === true, isActive: row.is_active === true, validFrom: row.valid_from ? String(row.valid_from) : null, validUntil: row.valid_until ? String(row.valid_until) : null, revision: num(row.revision) });
const assignmentFrom = (row: Row): SalesGoalAssignmentRecord => ({ id: String(row.id), goalId: String(row.goal_id), periodId: String(row.period_id), profileId: row.profile_id ? String(row.profile_id) : null, targetValueSnapshot: num(row.target_value_snapshot), commissionPercentSnapshot: num(row.commission_percent_snapshot), targetOverride: row.target_override == null ? null : num(row.target_override), commissionOverride: row.commission_override == null ? null : num(row.commission_override), goalScopeSnapshot: scopeFrom(row.goal_scope_snapshot), goalRevision: num(row.goal_revision), isActive: row.is_active === true, revision: num(row.revision) });

const errors: Record<string, Omit<SalesAdminError, "details">> = {
  sales_admin_required: { code: "FORBIDDEN", message: "Acesso restrito a administradores ativos.", status: 403 },
  sales_config_validation: { code: "INVALID_INPUT", message: "Configuração inválida.", status: 400 },
  sales_holiday_validation: { code: "INVALID_INPUT", message: "Feriado inválido.", status: 400 },
  sales_period_validation: { code: "INVALID_INPUT", message: "Período inválido.", status: 400 },
  sales_goal_validation: { code: "INVALID_INPUT", message: "Meta inválida.", status: 400 },
  sales_goal_identity_scope_invalid: { code: "INVALID_INPUT", message: "Identidade e escopo da meta são incompatíveis.", status: 400 },
  sales_assignment_validation: { code: "INVALID_INPUT", message: "Atribuição inválida.", status: 400 },
  sales_closed_period_immutable: { code: "CLOSED_PERIOD", message: "Períodos encerrados são somente leitura.", status: 409 },
  sales_closed_period_or_not_found: { code: "CLOSED_PERIOD", message: "O período não está aberto para esta operação.", status: 409 },
  sales_overlapping_period: { code: "OVERLAPPING_PERIOD", message: "O período se sobrepõe a outro existente.", status: 409 },
  sales_duplicate_holiday: { code: "DUPLICATE_HOLIDAY", message: "Já existe um feriado nesta data.", status: 409 },
  sales_duplicate_goal_identity: { code: "DUPLICATE_GOAL_IDENTITY", message: "Já existe uma meta com esta identidade.", status: 409 },
  sales_ineligible_assignee: { code: "INELIGIBLE_ASSIGNEE", message: "A consultora não é elegível para esta atribuição.", status: 409 },
  sales_goal_has_history: { code: "GOAL_HAS_HISTORY", message: "Esta meta tem histórico em período encerrado e não pode ser excluída. Você pode zerar os valores ou criar outra.", status: 409 },
  sales_stale_revision: { code: "STALE_REVISION", message: "Os dados foram alterados por outra sessão. Recarregue e tente novamente.", status: 409 },
  sales_not_found_or_out_of_scope: { code: "RESOURCE_NOT_FOUND", message: "Registro indisponível para esta operação.", status: 404 },
};
function errorFrom(error: PostgrestError): SalesAdminError {
  const match = Object.entries(errors).find(([key]) => error.message.includes(key))?.[1];
  if (match) return match;
  console.error("Sales admin configuration RPC failed", { code: error.code, message: error.message });
  return { code: "SERVICE_UNAVAILABLE", message: "A configuração comercial está temporariamente indisponível.", status: 503 };
}
const failed = <T>(error: PostgrestError): SalesAdminResult<T> => ({ data: null, error: errorFrom(error) });
const ok = <T>(data: T): SalesAdminResult<T> => ({ data, error: null });

export interface SalesProvisionDefaultsResult {
  configCreated: boolean;
  methodsCreated: number;
  periodId: string | null;
  periodCreated: boolean;
  goalsCreated: number;
  assignmentsCreated: number;
}

/**
 * Inicializa, para o tenant do ADM chamador, config + métodos + período aberto do
 * mês + as 6 metas canônicas + atribuições. Idempotente (a RPC só preenche o que
 * falta). Substitui o script de provisionamento por um clique na interface.
 */
export async function provisionSalesDefaults(supabase: SupabaseClient): Promise<SalesAdminResult<SalesProvisionDefaultsResult>> {
  const { data, error } = await supabase.rpc("sales_admin_provision_defaults_v1");
  if (error) return failed(error);
  const row = (data ?? {}) as Row;
  return ok({
    configCreated: row.config_created === true,
    methodsCreated: num(row.methods_created ?? 0),
    periodId: row.period_id ? String(row.period_id) : null,
    periodCreated: row.period_created === true,
    goalsCreated: num(row.goals_created ?? 0),
    assignmentsCreated: num(row.assignments_created ?? 0),
  });
}

export async function loadSalesAdminConfiguration(supabase: SupabaseClient): Promise<SalesAdminResult<SalesAdminConfiguration>> {
  const { data, error } = await supabase.rpc("sales_admin_configuration_v1"); if (error) return failed(error);
  const row = (data ?? {}) as Row;
  return ok({ config: row.config ? configFrom(row.config as Row) : null, holidays: Array.isArray(row.holidays) ? row.holidays.map((item) => holidayFrom(item as Row)) : [], periods: Array.isArray(row.periods) ? row.periods.map((item) => periodFrom(item as Row)) : [], goals: Array.isArray(row.goals) ? row.goals.map((item) => goalFrom(item as Row)) : [], assignments: Array.isArray(row.assignments) ? row.assignments.map((item) => assignmentFrom(item as Row)) : [] });
}
export async function setSalesConfig(supabase: SupabaseClient, input: SalesConfigInput) { const { data, error } = await supabase.rpc("sales_admin_set_config_v1", { p_pieces_per_set: input.piecesPerSet, p_timezone: input.timezone, p_week_starts_on: input.weekStartsOn, p_allow_team_aggregates: input.allowTeamAggregates, p_expected_revision: input.expectedRevision }); return error ? failed<SalesConfigRecord>(error) : ok(configFrom(data as Row)); }
export async function setSalesHoliday(supabase: SupabaseClient, input: SalesHolidayInput) { const { data, error } = await supabase.rpc("sales_admin_set_holiday_v1", { p_holiday_id: input.holidayId ?? null, p_date: input.date, p_name: input.name, p_is_active: input.isActive, p_expected_revision: input.expectedRevision }); return error ? failed<SalesHolidayRecord>(error) : ok(holidayFrom(data as Row)); }
export async function setSalesPeriod(supabase: SupabaseClient, input: SalesPeriodInput) { const { data, error } = await supabase.rpc("sales_admin_set_period_v1", { p_period_id: input.periodId ?? null, p_starts_on: input.startsOn, p_ends_on: input.endsOn, p_expected_revision: input.expectedRevision }); return error ? failed<SalesPeriodRecord>(error) : ok(periodFrom(data as Row)); }
export async function setSalesGoal(supabase: SupabaseClient, input: SalesGoalInput) { const { data, error } = await supabase.rpc("sales_admin_set_goal_v1", { p_goal_id: input.goalId ?? null, p_provisioning_key: input.provisioningKey, p_name: input.name, p_scope: input.scope, p_target_value: input.targetValue, p_commission_percent: input.commissionPercent, p_sort_order: input.sortOrder, p_is_challenge: input.isChallenge, p_is_active: input.isActive, p_valid_from: input.validFrom, p_valid_until: input.validUntil, p_expected_revision: input.expectedRevision }); return error ? failed<SalesGoalRecord>(error) : ok(goalFrom(data as Row)); }
export async function setSalesGoalAssignment(supabase: SupabaseClient, input: SalesGoalAssignmentInput) { const { data, error } = await supabase.rpc("sales_admin_set_goal_assignment_v2", { p_assignment_id: input.assignmentId ?? null, p_goal_id: input.goalId, p_period_id: input.periodId, p_profile_id: input.profileId, p_is_active: input.isActive, p_target_override: input.targetOverride ?? null, p_commission_override: input.commissionOverride ?? null, p_expected_revision: input.expectedRevision }); return error ? failed<SalesGoalAssignmentRecord>(error) : ok(assignmentFrom(data as Row)); }

/** Exclusão definitiva de meta (bloqueada se houver histórico em período encerrado). */
export async function deleteSalesGoal(supabase: SupabaseClient, goalId: string): Promise<SalesAdminResult<{ id: string; deleted: boolean }>> {
  const { data, error } = await supabase.rpc("sales_admin_delete_goal_v1", { p_goal_id: goalId });
  if (error) return failed(error);
  const row = (data ?? {}) as Row;
  return ok({ id: String(row.id ?? goalId), deleted: row.deleted === true });
}

/** Exclusão definitiva de atribuição (somente em período aberto). */
export async function deleteSalesGoalAssignment(supabase: SupabaseClient, assignmentId: string): Promise<SalesAdminResult<{ id: string; deleted: boolean }>> {
  const { data, error } = await supabase.rpc("sales_admin_delete_goal_assignment_v1", { p_assignment_id: assignmentId });
  if (error) return failed(error);
  const row = (data ?? {}) as Row;
  return ok({ id: String(row.id ?? assignmentId), deleted: row.deleted === true });
}

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export const salesMembershipInputSchema = z
  .object({
    profileId: z.string().uuid(),
    role: z.enum(["ADMIN", "CONSULTANT"]),
    isActive: z.boolean(),
  })
  .strict();

export const salesPaymentMethodInputSchema = z
  .object({
    methodId: z.string().uuid().nullable().optional(),
    name: z.string().trim().min(1).max(120),
    isActive: z.boolean(),
  })
  .strict();

// D2: dados da consultora escopados ao Vendas.
export const salesConsultantDetailsInputSchema = z
  .object({
    profileId: z.string().uuid(),
    displayName: z.string().trim().max(120).nullable(),
    phone: z.string().trim().max(40).nullable(),
    notes: z.string().trim().max(2000).nullable(),
  })
  .strict();

export const salesPaymentMethodReorderInputSchema = z
  .object({
    orderedMethodIds: z.array(z.string().uuid()).max(500),
    expectedOrderRevision: z.number().int().nonnegative().safe(),
    idempotencyKey: z.string().trim().min(1).max(200),
  })
  .strict()
  .superRefine(({ orderedMethodIds }, context) => {
    if (new Set(orderedMethodIds).size !== orderedMethodIds.length) {
      context.addIssue({
        code: "custom",
        path: ["orderedMethodIds"],
        message: "A ordem não pode conter IDs duplicados.",
      });
    }
  });

export type SalesMembershipInput = z.infer<typeof salesMembershipInputSchema>;
export type SalesConsultantDetailsInput = z.infer<typeof salesConsultantDetailsInputSchema>;
export interface SalesConsultantDetails { profileId: string; displayName: string | null; phone: string | null; notes: string | null; }
export type SalesPaymentMethodInput = z.infer<
  typeof salesPaymentMethodInputSchema
>;
export type SalesPaymentMethodReorderInput = z.infer<
  typeof salesPaymentMethodReorderInputSchema
>;

export interface SalesAdminDirectoryEntry {
  profileId: string;
  fullName: string | null;
  email: string | null;
  profileIsActive: boolean;
  membershipId: string | null;
  salesRole: "ADMIN" | "CONSULTANT" | null;
  membershipIsActive: boolean;
}

export interface SalesAdminMembership {
  id: string;
  profileId: string;
  role: "ADMIN" | "CONSULTANT";
  isActive: boolean;
}

export interface SalesAdminPaymentMethod {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface SalesAdminPaymentMethods {
  orderRevision: number;
  methods: SalesAdminPaymentMethod[];
}

export interface SalesAdminPaymentMethodOrder {
  orderRevision: number;
  orderedMethodIds: string[];
}

export type SalesAdminErrorCode =
  | "FORBIDDEN"
  | "INVALID_INPUT"
  | "RESOURCE_NOT_FOUND"
  | "LAST_ACTIVE_ADMIN"
  | "PAYMENT_METHOD_NAME_CONFLICT"
  | "ORDER_REVISION_CONFLICT"
  | "ORDER_SET_CONFLICT"
  | "IDEMPOTENCY_KEY_CONFLICT"
  | "CLOSED_PERIOD"
  | "OVERLAPPING_PERIOD"
  | "DUPLICATE_HOLIDAY"
  | "DUPLICATE_GOAL_IDENTITY"
  | "GOAL_HAS_HISTORY"
  | "PERMISSION_LOCKOUT"
  | "INELIGIBLE_ASSIGNEE"
  | "STALE_REVISION"
  | "VALIDATION"
  | "CONFLICT"
  | "DUPLICATE_PV"
  | "INELIGIBLE_CONSULTANT"
  | "INVALID_PAYMENT_METHOD"
  | "IDEMPOTENCY_MISMATCH"
  | "NOT_FOUND_OR_OUT_OF_SCOPE"
  | "NEXT_PERIOD_NOT_EMPTY"
  | "INVALID_NEXT_PERIOD"
  | "STALE_PREVIEW"
  | "PERIOD_ALREADY_CLOSED"
  | "SERVICE_UNAVAILABLE";

export interface SalesAdminError {
  code: SalesAdminErrorCode;
  message: string;
  status: number;
  details?: SalesAdminPaymentMethodOrder;
}

export type SalesAdminResult<T> =
  | { data: T; error: null }
  | { data: null; error: SalesAdminError };

interface DirectoryRpcEntry {
  profile_id?: string;
  full_name?: string | null;
  email?: string | null;
  profile_is_active?: boolean;
  membership_id?: string | null;
  sales_role?: "ADMIN" | "CONSULTANT" | null;
  membership_is_active?: boolean;
}

interface MembershipRpcResult {
  id?: string;
  profile_id?: string;
  role?: "ADMIN" | "CONSULTANT";
  is_active?: boolean;
}

interface PaymentMethodRpcResult {
  id?: string;
  name?: string;
  sort_order?: number;
  is_active?: boolean;
}

interface PaymentMethodsRpcResult {
  order_revision?: number;
  methods?: PaymentMethodRpcResult[];
}

interface PaymentMethodOrderRpcResult {
  order_revision?: number;
  ordered_method_ids?: string[];
}

const ERROR_CONTRACTS: Record<
  string,
  Omit<SalesAdminError, "details">
> = {
  sales_admin_required: {
    code: "FORBIDDEN",
    message: "Acesso restrito a administradores ativos do LISION Vendas.",
    status: 403,
  },
  sales_membership_state_invalid: {
    code: "INVALID_INPUT",
    message: "Estado da membership inválido.",
    status: 400,
  },
  sales_payment_method_name_invalid: {
    code: "INVALID_INPUT",
    message: "Nome do método de pagamento inválido.",
    status: 400,
  },
  sales_payment_method_reorder_invalid: {
    code: "INVALID_INPUT",
    message: "Ordem dos métodos de pagamento inválida.",
    status: 400,
  },
  sales_profile_not_found_or_ineligible: {
    code: "RESOURCE_NOT_FOUND",
    message: "Perfil indisponível para esta operação.",
    status: 404,
  },
  sales_membership_not_found: {
    code: "RESOURCE_NOT_FOUND",
    message: "Membership indisponível para esta operação.",
    status: 404,
  },
  sales_payment_method_not_found: {
    code: "RESOURCE_NOT_FOUND",
    message: "Método de pagamento indisponível para esta operação.",
    status: 404,
  },
  sales_last_active_admin: {
    code: "LAST_ACTIVE_ADMIN",
    message: "O último administrador ativo não pode ser removido.",
    status: 409,
  },
  sales_payment_method_name_conflict: {
    code: "PAYMENT_METHOD_NAME_CONFLICT",
    message: "Já existe um método de pagamento com esse nome.",
    status: 409,
  },
  sales_payment_method_order_revision_conflict: {
    code: "ORDER_REVISION_CONFLICT",
    message: "A ordem foi alterada por outra sessão. Recarregue e tente novamente.",
    status: 409,
  },
  sales_payment_method_order_set_conflict: {
    code: "ORDER_SET_CONFLICT",
    message: "A lista não corresponde aos métodos de pagamento atuais.",
    status: 409,
  },
  sales_idempotency_key_payload_conflict: {
    code: "IDEMPOTENCY_KEY_CONFLICT",
    message: "A chave de repetição já foi usada com outro conteúdo.",
    status: 409,
  },
  sales_filter_validation: { code: "VALIDATION", message: "Filtros inválidos.", status: 400 },
  sales_validation: { code: "VALIDATION", message: "Revise os dados da venda.", status: 400 },
  sales_cancellation_validation: { code: "VALIDATION", message: "Informe um motivo válido.", status: 400 },
  sales_not_found_or_out_of_scope: { code: "NOT_FOUND_OR_OUT_OF_SCOPE", message: "Venda indisponível.", status: 404 },
  sales_closed_period_or_not_found: { code: "CLOSED_PERIOD", message: "Somente leitura — período encerrado.", status: 409 },
  sales_stale_revision: { code: "STALE_REVISION", message: "A venda foi alterada por outra sessão. Recarregue antes de salvar.", status: 409 },
  sales_duplicate_pv: { code: "DUPLICATE_PV", message: "Já existe uma venda com este PV.", status: 409 },
  sales_ineligible_consultant: { code: "INELIGIBLE_CONSULTANT", message: "A consultora não está elegível.", status: 422 },
  sales_invalid_payment_method: { code: "INVALID_PAYMENT_METHOD", message: "O método de pagamento não está disponível.", status: 422 },
  sales_idempotency_mismatch: { code: "IDEMPOTENCY_MISMATCH", message: "Esta tentativa já foi usada com outros dados.", status: 409 },
  sales_cancellation_conflict: { code: "CONFLICT", message: "A venda já foi cancelada com outro motivo.", status: 409 },
  sales_delete_validation: { code: "VALIDATION", message: "Dados de exclusão inválidos.", status: 400 },
  sales_consultant_not_in_scope: { code: "RESOURCE_NOT_FOUND", message: "Consultora indisponível para esta operação.", status: 404 },
  sales_consultant_details_validation: { code: "INVALID_INPUT", message: "Dados da consultora inválidos.", status: 400 },
  sales_permission_lockout: { code: "PERMISSION_LOCKOUT", message: "Você não pode remover seu próprio acesso a Configurações.", status: 409 },
};

export async function loadSalesAreaPermissions(supabase: SupabaseClient): Promise<SalesAdminResult<unknown>> {
  const { data, error } = await supabase.rpc("sales_admin_area_permissions_v1");
  if (error) return { data: null, error: mapSalesAdminRpcError(error) };
  return { data: data ?? {}, error: null };
}

export async function setSalesAreaPermissions(
  supabase: SupabaseClient,
  roleOverrides: Record<string, Record<string, boolean>>,
  userOverrides: Record<string, Record<string, boolean>>,
): Promise<SalesAdminResult<unknown>> {
  const { data, error } = await supabase.rpc("sales_admin_set_area_permissions_v1", {
    p_role_overrides: roleOverrides,
    p_user_overrides: userOverrides,
  });
  if (error) return { data: null, error: mapSalesAdminRpcError(error) };
  return { data: data ?? {}, error: null };
}

function parseOrderDetails(details?: string | null) {
  if (!details) return undefined;
  try {
    const parsed = JSON.parse(details) as PaymentMethodOrderRpcResult;
    if (
      typeof parsed.order_revision === "number" &&
      Array.isArray(parsed.ordered_method_ids) &&
      parsed.ordered_method_ids.every((id) => typeof id === "string")
    ) {
      return {
        orderRevision: parsed.order_revision,
        orderedMethodIds: parsed.ordered_method_ids,
      };
    }
  } catch {
    // PostgreSQL details are optional; never expose an unparsed database string.
  }
  return undefined;
}

export function mapSalesAdminRpcError(error: PostgrestError): SalesAdminError {
  const contract = Object.entries(ERROR_CONTRACTS).find(([key]) =>
    error.message.includes(key),
  )?.[1];

  if (!contract) {
    console.error("LISION Vendas admin RPC failed", {
      code: error.code,
      message: error.message,
    });
    return {
      code: "SERVICE_UNAVAILABLE",
      message: "A administração do LISION Vendas está temporariamente indisponível.",
      status: 503,
    };
  }

  const details = parseOrderDetails(error.details);
  return details ? { ...contract, details } : contract;
}

function unavailableResult<T>(): SalesAdminResult<T> {
  return {
    data: null,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message: "A administração do LISION Vendas está temporariamente indisponível.",
      status: 503,
    },
  };
}

export async function loadSalesAdminDirectory(
  supabase: SupabaseClient,
): Promise<SalesAdminResult<SalesAdminDirectoryEntry[]>> {
  const { data, error } = await supabase.rpc("sales_admin_directory_v1");
  if (error) return { data: null, error: mapSalesAdminRpcError(error) };
  if (!Array.isArray(data)) return unavailableResult();

  const entries = (data as DirectoryRpcEntry[]).map((entry) => ({
    profileId: entry.profile_id ?? "",
    fullName: entry.full_name ?? null,
    email: entry.email ?? null,
    profileIsActive: entry.profile_is_active === true,
    membershipId: entry.membership_id ?? null,
    salesRole: entry.sales_role ?? null,
    membershipIsActive: entry.membership_is_active === true,
  }));
  if (entries.some((entry) => !entry.profileId)) return unavailableResult();
  return { data: entries, error: null };
}

/**
 * Busca explícita de perfis do tenant (produção incluída) para promover a ADMIN
 * do Vendas. Diferente de loadSalesAdminDirectory (escopado ao Vendas), esta porta
 * enxerga todos os profiles — só sob busca ativa do admin. Termo < 2 chars → vazio.
 */
export async function searchSalesAdminProfiles(
  supabase: SupabaseClient,
  query: string,
): Promise<SalesAdminResult<SalesAdminDirectoryEntry[]>> {
  const { data, error } = await supabase.rpc("sales_admin_profile_search_v1", { p_query: query });
  if (error) return { data: null, error: mapSalesAdminRpcError(error) };
  if (!Array.isArray(data)) return unavailableResult();
  const entries = (data as DirectoryRpcEntry[]).map((entry) => ({
    profileId: entry.profile_id ?? "",
    fullName: entry.full_name ?? null,
    email: entry.email ?? null,
    profileIsActive: entry.profile_is_active === true,
    membershipId: entry.membership_id ?? null,
    salesRole: entry.sales_role ?? null,
    membershipIsActive: entry.membership_is_active === true,
  }));
  if (entries.some((entry) => !entry.profileId)) return unavailableResult();
  return { data: entries, error: null };
}

export async function setSalesAdminMembership(
  supabase: SupabaseClient,
  input: SalesMembershipInput,
): Promise<SalesAdminResult<SalesAdminMembership>> {
  const { data, error } = await supabase.rpc("sales_admin_set_membership_v1", {
    p_profile_id: input.profileId,
    p_role: input.role,
    p_is_active: input.isActive,
  });
  if (error) return { data: null, error: mapSalesAdminRpcError(error) };
  const row = (data ?? {}) as MembershipRpcResult;
  if (!row.id || !row.profile_id || !row.role) return unavailableResult();
  return {
    data: {
      id: row.id,
      profileId: row.profile_id,
      role: row.role,
      isActive: row.is_active === true,
    },
    error: null,
  };
}

export async function loadSalesAdminPaymentMethods(
  supabase: SupabaseClient,
): Promise<SalesAdminResult<SalesAdminPaymentMethods>> {
  const { data, error } = await supabase.rpc("sales_admin_payment_methods_v1");
  if (error) return { data: null, error: mapSalesAdminRpcError(error) };
  const result = (data ?? {}) as PaymentMethodsRpcResult;
  if (typeof result.order_revision !== "number" || !Array.isArray(result.methods)) {
    return unavailableResult();
  }
  const methods = result.methods.map((method) => ({
    id: method.id ?? "",
    name: method.name ?? "",
    sortOrder: method.sort_order ?? -1,
    isActive: method.is_active === true,
  }));
  if (methods.some((method) => !method.id || !method.name || method.sortOrder < 0)) {
    return unavailableResult();
  }
  return {
    data: { orderRevision: result.order_revision, methods },
    error: null,
  };
}

export async function setSalesAdminPaymentMethod(
  supabase: SupabaseClient,
  input: SalesPaymentMethodInput,
): Promise<SalesAdminResult<SalesAdminPaymentMethod>> {
  const { data, error } = await supabase.rpc(
    "sales_admin_set_payment_method_v1",
    {
      p_method_id: input.methodId ?? null,
      p_name: input.name,
      p_is_active: input.isActive,
    },
  );
  if (error) return { data: null, error: mapSalesAdminRpcError(error) };
  const row = (data ?? {}) as PaymentMethodRpcResult;
  if (!row.id || !row.name || typeof row.sort_order !== "number") {
    return unavailableResult();
  }
  return {
    data: {
      id: row.id,
      name: row.name,
      sortOrder: row.sort_order,
      isActive: row.is_active === true,
    },
    error: null,
  };
}

export async function reorderSalesAdminPaymentMethods(
  supabase: SupabaseClient,
  input: SalesPaymentMethodReorderInput,
): Promise<SalesAdminResult<SalesAdminPaymentMethodOrder>> {
  const { data, error } = await supabase.rpc(
    "sales_admin_reorder_payment_methods_v1",
    {
      p_ordered_method_ids: input.orderedMethodIds,
      p_expected_order_revision: input.expectedOrderRevision,
      p_idempotency_key: input.idempotencyKey,
    },
  );
  if (error) return { data: null, error: mapSalesAdminRpcError(error) };
  const result = (data ?? {}) as PaymentMethodOrderRpcResult;
  if (
    typeof result.order_revision !== "number" ||
    !Array.isArray(result.ordered_method_ids)
  ) {
    return unavailableResult();
  }
  return {
    data: {
      orderRevision: result.order_revision,
      orderedMethodIds: result.ordered_method_ids,
    },
    error: null,
  };
}

interface ConsultantDetailsRpcResult { profile_id?: string; display_name?: string | null; phone?: string | null; notes?: string | null; }
function detailsFrom(row: ConsultantDetailsRpcResult): SalesConsultantDetails {
  return { profileId: row.profile_id ?? "", displayName: row.display_name ?? null, phone: row.phone ?? null, notes: row.notes ?? null };
}
export async function loadSalesConsultantDetails(supabase: SupabaseClient, profileId: string): Promise<SalesAdminResult<SalesConsultantDetails>> {
  const { data, error } = await supabase.rpc("sales_admin_consultant_details_v1", { p_profile_id: profileId });
  if (error) return { data: null, error: mapSalesAdminRpcError(error) };
  return { data: detailsFrom((data ?? {}) as ConsultantDetailsRpcResult), error: null };
}
export async function setSalesConsultantDetails(supabase: SupabaseClient, input: SalesConsultantDetailsInput): Promise<SalesAdminResult<SalesConsultantDetails>> {
  const { data, error } = await supabase.rpc("sales_admin_set_consultant_details_v1", { p_profile_id: input.profileId, p_display_name: input.displayName, p_phone: input.phone, p_notes: input.notes });
  if (error) return { data: null, error: mapSalesAdminRpcError(error) };
  return { data: detailsFrom((data ?? {}) as ConsultantDetailsRpcResult), error: null };
}

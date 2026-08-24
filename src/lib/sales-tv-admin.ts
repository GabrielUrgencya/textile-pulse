import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const uuid = z.string().uuid();
const instant = z.string().datetime({ offset: true });

export const salesTvCreateSchema = z
  .object({ name: z.string().trim().min(1).max(120), expiresAt: instant })
  .strict();
export const salesTvRotateSchema = z
  .object({ credentialId: uuid, expiresAt: instant })
  .strict();
export const salesTvRevokeSchema = z.object({ credentialId: uuid }).strict();

const inactive = z.object({ active: z.literal(false) }).strict();
const active = z
  .object({
    active: z.literal(true),
    credential_id: uuid,
    name: z.string().min(1).max(120),
    generation: z.number().int().positive(),
    expires_at: instant,
    created_at: instant,
    updated_at: instant,
  })
  .strict();
export const salesTvAdminStatusSchema = z.discriminatedUnion("active", [
  inactive,
  active,
]);
const revealed = z
  .object({
    credential_id: uuid,
    token: z.string().regex(/^[0-9a-f]{64}$/),
    expires_at: instant,
  })
  .strict();

export type SalesTvAdminStatus = z.infer<typeof salesTvAdminStatusSchema>;
export type SalesTvSecret = z.infer<typeof revealed>;
export type SalesTvAdminError = {
  code: string;
  message: string;
  status: number;
};
export type SalesTvAdminResult<T> = {
  data: T | null;
  error: SalesTvAdminError | null;
};

const knownErrors: Record<string, SalesTvAdminError> = {
  sales_admin_required: {
    code: "FORBIDDEN",
    message: "Gestão da TV indisponível.",
    status: 403,
  },
  sales_tv_kiosk_validation: {
    code: "VALIDATION",
    message: "Dados do acesso à TV inválidos.",
    status: 400,
  },
  sales_tv_kiosk_active_exists: {
    code: "CONFLICT",
    message: "Já existe um acesso ativo para a TV.",
    status: 409,
  },
  sales_not_found_or_out_of_scope: {
    code: "NOT_FOUND",
    message: "Acesso à TV indisponível.",
    status: 404,
  },
};

function failure<T>(error: PostgrestError): SalesTvAdminResult<T> {
  const known = Object.entries(knownErrors).find(([key]) =>
    error.message.includes(key),
  )?.[1];
  return {
    data: null,
    error: known ?? {
      code: "SERVICE_UNAVAILABLE",
      message: "Gestão da TV temporariamente indisponível.",
      status: 503,
    },
  };
}

function parse<T>(schema: z.ZodType<T>, data: unknown): SalesTvAdminResult<T> {
  const parsed = schema.safeParse(data);
  return parsed.success
    ? { data: parsed.data, error: null }
    : {
        data: null,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Gestão da TV temporariamente indisponível.",
          status: 503,
        },
      };
}

export async function loadSalesTvAdminStatus(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("sales_tv_kiosk_admin_status_v2");
  return error
    ? failure<SalesTvAdminStatus>(error)
    : parse(salesTvAdminStatusSchema, data);
}

export async function createSalesTvCredential(
  supabase: SupabaseClient,
  input: z.infer<typeof salesTvCreateSchema>,
) {
  const { data, error } = await supabase.rpc("sales_tv_kiosk_admin_create_v2", {
    p_name: input.name,
    p_expires_at: input.expiresAt,
  });
  return error ? failure<SalesTvSecret>(error) : parse(revealed, data);
}

export async function rotateSalesTvCredential(
  supabase: SupabaseClient,
  input: z.infer<typeof salesTvRotateSchema>,
) {
  const { data, error } = await supabase.rpc("sales_tv_kiosk_admin_rotate_v2", {
    p_credential_id: input.credentialId,
    p_expires_at: input.expiresAt,
  });
  return error ? failure<SalesTvSecret>(error) : parse(revealed, data);
}

export async function revokeSalesTvCredential(
  supabase: SupabaseClient,
  input: z.infer<typeof salesTvRevokeSchema>,
) {
  const { data, error } = await supabase.rpc("sales_tv_kiosk_admin_revoke_v2", {
    p_credential_id: input.credentialId,
  });
  return error
    ? failure<{ revoked: true }>(error)
    : parse(z.object({ revoked: z.literal(true) }).strict(), data);
}

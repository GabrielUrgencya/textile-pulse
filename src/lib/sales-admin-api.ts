import { NextResponse } from "next/server";
import type { z } from "zod";
import { withAuth } from "@/lib/auth-middleware";
import type { SalesAdminError, SalesAdminResult } from "@/lib/sales-admin";

export const SALES_ADMIN_NO_STORE = { "Cache-Control": "no-store" } as const;

export function salesAdminErrorResponse(error: SalesAdminError) {
  return NextResponse.json(
    {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    },
    { status: error.status, headers: SALES_ADMIN_NO_STORE },
  );
}

export async function requireSalesAdminSession() {
  const auth = await withAuth();
  if (auth.error) {
    return {
      supabase: null,
      error: NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Sessão inválida ou expirada.",
          },
        },
        { status: 401, headers: SALES_ADMIN_NO_STORE },
      ),
    } as const;
  }
  return { supabase: auth.supabase, error: null } as const;
}

export async function parseSalesAdminBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<
  | { data: z.infer<T>; error: null }
  | { data: null; error: NextResponse }
> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidBodyResponse();
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return invalidBodyResponse();
  return { data: parsed.data, error: null };
}

export function salesAdminResultResponse<T>(
  result: SalesAdminResult<T>,
  status = 200,
) {
  if (result.error) return salesAdminErrorResponse(result.error);
  return NextResponse.json(
    { data: result.data },
    { status, headers: SALES_ADMIN_NO_STORE },
  );
}

function invalidBodyResponse() {
  return {
    data: null,
    error: NextResponse.json(
      {
        error: {
          code: "INVALID_INPUT",
          message: "Dados inválidos para esta operação.",
        },
      },
      { status: 400, headers: SALES_ADMIN_NO_STORE },
    ),
  } as const;
}

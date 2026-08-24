import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { hasSalesRole, loadSalesAccess } from "@/lib/sales-access";
import {
  createSalesTvCredential,
  loadSalesTvAdminStatus,
  revokeSalesTvCredential,
  rotateSalesTvCredential,
  salesTvCreateSchema,
  salesTvRevokeSchema,
  salesTvRotateSchema,
} from "@/lib/sales-tv-admin";

const headers = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
} as const;

async function requireAdmin() {
  const auth = await withAuth();
  if (auth.error)
    return {
      response: NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Sessão inválida ou expirada.",
          },
        },
        { status: 401, headers },
      ),
    };
  const access = await loadSalesAccess(auth.supabase, auth.user);
  if (access.error)
    return {
      response: NextResponse.json(
        {
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Gestão da TV temporariamente indisponível.",
          },
        },
        { status: 503, headers },
      ),
    };
  if (!access.access || !hasSalesRole(access.access, ["ADMIN"]))
    return {
      response: NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Gestão da TV indisponível." } },
        { status: 403, headers },
      ),
    };
  return { supabase: auth.supabase };
}

function result<T>(
  value: {
    data: T | null;
    error: { code: string; message: string; status: number } | null;
  },
  successStatus = 200,
) {
  return value.error
    ? NextResponse.json(
        { error: { code: value.error.code, message: value.error.message } },
        { status: value.error.status, headers },
      )
    : NextResponse.json(
        { data: value.data },
        { status: successStatus, headers },
      );
}

async function body(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function GET() {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  return result(await loadSalesTvAdminStatus(auth.supabase));
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const parsed = salesTvCreateSchema.safeParse(await body(request));
  if (!parsed.success)
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION",
          message: "Dados do acesso à TV inválidos.",
        },
      },
      { status: 400, headers },
    );
  return result(await createSalesTvCredential(auth.supabase, parsed.data), 201);
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const parsed = salesTvRotateSchema.safeParse(await body(request));
  if (!parsed.success)
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION",
          message: "Dados do acesso à TV inválidos.",
        },
      },
      { status: 400, headers },
    );
  return result(await rotateSalesTvCredential(auth.supabase, parsed.data));
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const parsed = salesTvRevokeSchema.safeParse(await body(request));
  if (!parsed.success)
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION",
          message: "Dados do acesso à TV inválidos.",
        },
      },
      { status: 400, headers },
    );
  return result(await revokeSalesTvCredential(auth.supabase, parsed.data));
}

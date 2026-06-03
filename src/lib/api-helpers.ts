import { NextResponse } from "next/server";
import type { PostgrestError } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

export function dbError(route: string, error: PostgrestError): NextResponse {
  console.error(`[${route}]`, error.message, error.code, error.details);
  return NextResponse.json(
    { error: error.message || "Database error" },
    { status: 500 },
  );
}

export function requireTenantId(user: User):
  | { tenantId: string; error: null }
  | { tenantId: null; error: NextResponse } {
  const tenantId = user.app_metadata?.tenant_id;
  if (!tenantId) {
    return {
      tenantId: null,
      error: NextResponse.json(
        { error: "Tenant não configurado para este usuário" },
        { status: 400 },
      ),
    };
  }
  return { tenantId, error: null };
}

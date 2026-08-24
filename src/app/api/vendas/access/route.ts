import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { loadSalesAccess, salesHomeForRole } from "@/lib/sales-access";

export async function GET() {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const result = await loadSalesAccess(auth.supabase, auth.user);
  if (result.error || !result.access) {
    return NextResponse.json(
      { error: "O módulo Vendas está temporariamente indisponível." },
      { status: 503 },
    );
  }

  if (!result.access.enabled || !result.access.role) {
    return NextResponse.json({
      enabled: false,
      role: null,
      home: null,
    });
  }

  return NextResponse.json({
    enabled: true,
    role: result.access.role,
    home: salesHomeForRole(result.access.role),
  });
}

import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";
import { computeAllowance } from "@/lib/allowance";

/**
 * GET /api/quality/allowance?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Story 8.4 — AC1, AC2, AC3
 * Returns allowance (defect rate) with breakdowns by type, responsible, and faction.
 */
export async function GET(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;

  if (!can(user, "quality:view")) {
    return NextResponse.json(
      { error: "Forbidden: quality:view required" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const today = new Date().toISOString().slice(0, 10);
  const from = searchParams.get("from") || today;
  const to = searchParams.get("to") || today;

  // Get tenant settings for allowance target
  const tenantId = user.app_metadata?.tenant_id;
  let allowanceTarget = 0.002; // default 0.2%

  if (tenantId) {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("settings")
      .eq("id", tenantId)
      .single();

    const settings = (tenant?.settings as Record<string, unknown>) || {};
    if (typeof settings.allowance_target === "number") {
      allowanceTarget = settings.allowance_target;
    }
  }

  try {
    const result = await computeAllowance(supabase, {
      from,
      to,
      allowanceTarget,
    });

    return NextResponse.json({ data: result });
  } catch (err) {
    console.error("[GET /api/quality/allowance]", err);
    return NextResponse.json(
      { error: "Failed to compute allowance" },
      { status: 500 }
    );
  }
}

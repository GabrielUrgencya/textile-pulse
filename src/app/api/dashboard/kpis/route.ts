import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { requireTenantId } from "@/lib/api-helpers";
import { computeKpis } from "@/lib/kpi-queries";
import { todayInTz } from "@/lib/tz";

export async function GET(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  const { searchParams } = new URL(request.url);

  // AC6: Date range filter — defaults to today (Story 8.29: fuso do tenant, não UTC)
  const today = todayInTz();
  const from = searchParams.get("from") || today;
  const to = searchParams.get("to") || today;

  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(from) || !dateRegex.test(to)) {
    return NextResponse.json(
      { error: "Invalid date format. Use YYYY-MM-DD" },
      { status: 400 }
    );
  }

  if (from > to) {
    return NextResponse.json(
      { error: "'from' date must be before or equal to 'to' date" },
      { status: 400 }
    );
  }

  try {
    // Check tenant setting for weighted meta (Story 8.1)
    const t = requireTenantId(user);
    let useWeightedMeta = false;
    if (!t.error) {
      const { data: tenantData } = await supabase
        .from("tenants")
        .select("settings")
        .eq("id", t.tenantId)
        .single();
      const settings = (tenantData?.settings as Record<string, unknown>) || {};
      useWeightedMeta = settings.use_weighted_meta !== false; // default: true
    }

    const kpis = await computeKpis(supabase, { from, to, useWeightedMeta });

    return NextResponse.json({
      kpis,
      period: { from, to },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to compute KPIs", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

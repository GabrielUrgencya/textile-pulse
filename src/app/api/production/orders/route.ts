import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { dbError } from "@/lib/api-helpers";
import { hasPermission, type AppRole } from "@/lib/permissions";

export async function POST(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;
  const role = user.app_metadata?.role;

  if (!hasPermission(role as AppRole, "orders:create")) {
    return NextResponse.json({ error: "Forbidden: orders:create required" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);

  if (!body?.op_number || !body?.product_name || !body?.total_quantity) {
    return NextResponse.json(
      { error: "op_number, product_name, and total_quantity are required" },
      { status: 400 }
    );
  }

  const tenantId = user.app_metadata?.tenant_id;
  if (!tenantId) {
    return NextResponse.json(
      { error: "User has no tenant_id in metadata" },
      { status: 403 }
    );
  }

  const metaCoefficient = body.meta_coefficient ?? 1.0;

  const { data: order, error: insertError } = await supabase
    .from("production_orders")
    .insert({
      tenant_id: tenantId,
      op_number: body.op_number,
      product_name: body.product_name,
      reference: body.reference || null,
      description: body.description || null,
      total_quantity: body.total_quantity,
      meta_coefficient: metaCoefficient,
      erp_reference: body.erp_reference || null,
      priority: body.priority ?? 0,
      notes: body.notes || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (insertError) return dbError("POST /api/production/orders", insertError);

  return NextResponse.json({ order }, { status: 201 });
}

export async function GET(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase } = auth;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));
  const includeCancelled = searchParams.get("include_cancelled") === "true";
  const statusFilter = searchParams.get("status"); // ex: COMPLETED (aba Concluídas)
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("production_orders")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (statusFilter) {
    // Filtro explícito por status (ex.: aba "Concluídas")
    query = query.eq("status", statusFilter);
  } else {
    // Padrão: lista de ativas — oculta concluídas (8.19) e canceladas (8.16)
    query = query.neq("status", "COMPLETED");
    if (!includeCancelled) {
      query = query.neq("status", "CANCELLED");
    }
  }

  const { data: orders, error, count } = await query;

  if (error) return dbError("GET /api/production/orders", error);

  return NextResponse.json({
    orders: orders || [],
    pagination: {
      page,
      limit,
      total: count || 0,
      pages: Math.ceil((count || 0) / limit),
    },
  });
}

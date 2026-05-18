import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  // AC2: meta_coefficient snapshot (reference_targets table not yet created,
  // accept from body or use default 1.0)
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

  if (insertError) {
    return NextResponse.json(
      { error: "Failed to create production order", details: insertError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ order }, { status: 201 });
}

// AC3: List OPs with pagination
export async function GET(request: Request) {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data: orders, error, count } = await supabase
    .from("production_orders")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch production orders" },
      { status: 500 }
    );
  }

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

import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { hasPermission, type AppRole } from "@/lib/permissions";

export async function GET() {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase } = auth;

  const { data: stages, error } = await supabase
    .from("stages")
    .select("*")
    .order("order_index", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch stages" }, { status: 500 });
  }

  return NextResponse.json({ data: stages || [] });
}

export async function POST(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;
  const role = user.app_metadata?.role;

  if (!hasPermission(role as AppRole, "settings:manage")) {
    return NextResponse.json({ error: "Forbidden: settings:manage required" }, { status: 403 });
  }

  const tenantId = user.app_metadata?.tenant_id;
  const body = await request.json().catch(() => null);

  if (!body?.name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  // M5 FIX: Validate unique name per tenant (case-insensitive)
  const { data: existingStage } = await supabase
    .from("stages")
    .select("id")
    .ilike("name", body.name)
    .limit(1)
    .maybeSingle();

  if (existingStage) {
    return NextResponse.json({ error: "Stage com este nome já existe" }, { status: 409 });
  }

  // Get max order_index
  const { data: existing } = await supabase
    .from("stages")
    .select("order_index")
    .order("order_index", { ascending: false })
    .limit(1);

  const nextIndex = (existing?.[0]?.order_index ?? -1) + 1;

  const { data: stage, error } = await supabase
    .from("stages")
    .insert({
      tenant_id: tenantId,
      name: body.name,
      color: body.color || null,
      order_index: nextIndex,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to create stage" }, { status: 500 });
  }

  return NextResponse.json({ data: stage }, { status: 201 });
}

import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";
import { dbError, requireTenantId } from "@/lib/api-helpers";

export async function GET() {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;
  const t = requireTenantId(user);
  if (t.error) return t.error;

  const { data: stages, error } = await supabase
    .from("stages")
    .select("*")
    .eq("tenant_id", t.tenantId)
    .eq("is_active", true)
    .order("order_index", { ascending: true });

  if (error) return dbError("GET /api/settings/stages", error);

  return NextResponse.json({ data: stages || [] });
}

export async function POST(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;

  if (!can(user, "settings:manage")) {
    return NextResponse.json({ error: "Forbidden: settings:manage required" }, { status: 403 });
  }

  const t = requireTenantId(user);
  if (t.error) return t.error;

  const body = await request.json().catch(() => null);

  if (!body?.name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  // M5 FIX: Validate unique name per tenant (case-insensitive)
  const { data: existingStage } = await supabase
    .from("stages")
    .select("id")
    .eq("tenant_id", t.tenantId)
    .eq("is_active", true)
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
    .eq("tenant_id", t.tenantId)
    .order("order_index", { ascending: false })
    .limit(1);

  const nextIndex = (existing?.[0]?.order_index ?? -1) + 1;

  const { data: stage, error } = await supabase
    .from("stages")
    .insert({
      tenant_id: t.tenantId,
      name: body.name,
      // FIX 500 (23502): display_name e type são NOT NULL sem default no banco —
      // a rota não os enviava e todo insert falhava. Defaults seguros:
      display_name: body.displayName || body.name,
      type: body.type || "INTERNAL",
      color: body.color || null,
      order_index: nextIndex,
    })
    .select()
    .single();

  if (error) return dbError("POST /api/settings/stages", error);

  return NextResponse.json({ data: stage }, { status: 201 });
}

import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";
import { dbError } from "@/lib/api-helpers";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;

  if (!can(user, "settings:manage")) {
    return NextResponse.json({ error: "Forbidden: settings:manage required" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);

  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.color !== undefined) updates.color = body.color;

  const { error } = await supabase
    .from("stages")
    .update(updates)
    .eq("id", id);

  if (error) return dbError("PATCH /api/settings/stages/[id]", error);

  return NextResponse.json({ data: { success: true } });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;

  if (!can(user, "settings:manage")) {
    return NextResponse.json({ error: "Forbidden: settings:manage required" }, { status: 403 });
  }

  const { id } = await params;

  // Check if stage has scan_records
  const { count } = await supabase
    .from("scan_records")
    .select("id", { count: "exact", head: true })
    .eq("stage_id", id);

  if (count && count > 0) {
    return NextResponse.json(
      { error: `Esta etapa possui ${count} bipagens. Não pode ser removida.` },
      { status: 409 },
    );
  }

  const { error } = await supabase
    .from("stages")
    .delete()
    .eq("id", id);

  if (error) return dbError("DELETE /api/settings/stages/[id]", error);

  return NextResponse.json({ data: { success: true } });
}

import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";

const ALLOWED_ROLES = ["ADMIN", "GERENTE", "COORDENADOR"];

/**
 * PATCH /api/ops-clock/[id] — Update ops clock states
 * Story 8.6 — AC3, AC4, AC5
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;
  const role = user.app_metadata?.role;

  if (!ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const now = new Date().toISOString();
  let updateData: Record<string, string>;

  switch (body.action) {
    case "start_loading":
      updateData = { loading_started_at: now };
      break;
    case "end_loading":
      updateData = { loading_ended_at: now };
      break;
    case "depart":
      updateData = { departed_at: now };
      break;
    default:
      return NextResponse.json(
        { error: "action must be: start_loading, end_loading, or depart" },
        { status: 400 }
      );
  }

  const { data, error } = await supabase
    .from("ops_clock")
    .update(updateData)
    .eq("id", id)
    .select("id, driver_id, arrived_at, loading_started_at, loading_ended_at, departed_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

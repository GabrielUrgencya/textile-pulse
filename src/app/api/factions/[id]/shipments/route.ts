import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { hasPermission, type AppRole } from "@/lib/permissions";
import { dbError } from "@/lib/api-helpers";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;
  const role = user.app_metadata?.role;

  if (!hasPermission(role as AppRole, "factions:view")) {
    return NextResponse.json({ error: "Forbidden: factions:view required" }, { status: 403 });
  }

  const { id } = await params;
  const url = new URL(request.url);
  const status = url.searchParams.get("status");

  let query = supabase
    .from("faction_shipments")
    .select("*")
    .eq("faction_id", id)
    .order("sent_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  const { data: shipments, error } = await query;

  if (error) return dbError("GET /api/factions/[id]/shipments", error);

  return NextResponse.json({ data: shipments || [] });
}

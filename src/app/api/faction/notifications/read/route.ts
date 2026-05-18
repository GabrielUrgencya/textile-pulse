import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateFactionSession } from "@/lib/faction-middleware";

/**
 * PATCH /api/faction/notifications/read
 * Story 6.5 — AC9, AC10
 * Marks notifications as read. Accepts array of IDs, validates faction ownership.
 */
export async function PATCH(request: Request) {
  const session = await validateFactionSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { ids: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json(
      { error: "MISSING_FIELD", message: "ids must be a non-empty array" },
      { status: 400 }
    );
  }

  if (body.ids.length > 100) {
    return NextResponse.json(
      { error: "TOO_MANY_IDS", message: "Maximum 100 IDs per request" },
      { status: 400 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const now = new Date().toISOString();

  // AC10: Update only notifications belonging to this faction
  const { data, error } = await supabase
    .from("notifications")
    .update({ read_at: now })
    .in("id", body.ids)
    .eq("faction_id", session.factionId)
    .is("read_at", null)
    .select("id");

  if (error) {
    console.error("[faction/notifications/read] Update error:", error);
    return NextResponse.json({ error: "Failed to mark notifications as read" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    markedCount: data?.length || 0,
    readAt: now,
  });
}

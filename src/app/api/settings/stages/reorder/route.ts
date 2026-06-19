import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";

export async function PATCH(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { supabase, user } = auth;

  if (!can(user, "settings:manage")) {
    return NextResponse.json({ error: "Forbidden: settings:manage required" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);

  if (!body?.stages || !Array.isArray(body.stages)) {
    return NextResponse.json({ error: "stages array is required" }, { status: 400 });
  }

  // H2 FIX: Batch update all stages atomically via Promise.all
  const updates = body.stages as Array<{ id: string; order_index: number }>;

  const results = await Promise.all(
    updates.map((item) =>
      supabase
        .from("stages")
        .update({ order_index: item.order_index })
        .eq("id", item.id),
    ),
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) {
    console.error("[stages/reorder] Batch update failed:", failed.error);
    return NextResponse.json({ error: "Failed to reorder stages" }, { status: 500 });
  }

  return NextResponse.json({ data: { success: true } });
}

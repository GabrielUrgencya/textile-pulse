import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { hasPermission, type AppRole } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { dbError } from "@/lib/api-helpers";
import bcrypt from "bcryptjs";
import { randomInt } from "crypto";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await withAuth();
  if (auth.error) return auth.error;

  const { user } = auth;
  const role = user.app_metadata?.role;

  if (!hasPermission(role as AppRole, "users:manage")) {
    return NextResponse.json({ error: "Forbidden: users:manage required" }, { status: 403 });
  }

  const { id } = await params;

  // Generate secure PIN
  const pin = String(randomInt(100000, 999999));
  const pinHash = await bcrypt.hash(pin, 10);

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ pin_code: pinHash })
    .eq("id", id);

  if (error) return dbError("PATCH /api/team/members/[id]/reset-pin", error);

  return NextResponse.json({ data: { pin } });
}

import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { getUserPermissions } from "@/lib/effective-permissions";

/**
 * Story 8.22 — Returns the effective permissions for the logged-in user.
 * Called by the frontend to drive menu visibility and UI gating.
 */
export async function GET() {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { user } = auth;

  const permissions = getUserPermissions(user);

  return NextResponse.json({ permissions });
}

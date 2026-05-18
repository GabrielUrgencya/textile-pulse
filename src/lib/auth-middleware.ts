import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "./supabase-server";

/**
 * Validates the Supabase session and returns the authenticated user.
 * Use in protected API Route Handlers to enforce authentication.
 *
 * Returns NextResponse with 401 if no valid session, otherwise the user object.
 */
export async function withAuth() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      user: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { user, error: null };
}

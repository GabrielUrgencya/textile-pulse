import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "./supabase-server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { loadUserPermissions } from "./effective-permissions";

/**
 * Creates a Supabase client and validates the user in one step.
 *
 * Hybrid approach for performance + security:
 *   1. Try getSession() first — reads JWT from cookie, zero HTTP roundtrip (~0ms)
 *   2. If session exists AND has role in app_metadata → use it (fast path)
 *   3. If role is missing → fall back to getUser() (HTTP roundtrip to Supabase Auth)
 *
 * This eliminates ~200-500ms per API call for the 99% case where
 * app_metadata is present in the JWT, while keeping the safety net
 * for edge cases (new user, role just assigned, stale JWT).
 */
export async function withAuth(): Promise<
  | { supabase: SupabaseClient; user: User; error: null }
  | { supabase: null; user: null; error: NextResponse }
> {
  const supabase = createSupabaseServerClient();

  // Fast path: read JWT from cookie (no HTTP roundtrip)
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.user) {
    const role = session.user.app_metadata?.role;

    if (role) {
      // JWT has role — trust it (fast path)
      // Story 8.22: populate WeakMap for can() checks
      await loadUserPermissions(supabase, session.user);
      return { supabase, user: session.user, error: null };
    }

    // Role missing in JWT — fall back to server validation
    // This happens when role was just assigned or JWT is stale
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        supabase: null,
        user: null,
        error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      };
    }

    // Story 8.22: populate WeakMap for can() checks
    await loadUserPermissions(supabase, user);
    return { supabase, user, error: null };
  }

  // No session at all — unauthorized
  return {
    supabase: null,
    user: null,
    error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  };
}

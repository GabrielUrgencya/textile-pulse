import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "./supabase-server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * Creates a Supabase client and validates the user in one step.
 * Uses getUser() instead of getSession() for:
 *   1. Server-side JWT validation (security — session cookie can be tampered)
 *   2. Fresh app_metadata (role, tenant_id) on every request
 */
export async function withAuth(): Promise<
  | { supabase: SupabaseClient; user: User; error: null }
  | { supabase: null; user: null; error: NextResponse }
> {
  const supabase = createSupabaseServerClient();
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

  return { supabase, user, error: null };
}

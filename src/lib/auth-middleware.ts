import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "./supabase-server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Creates a Supabase client and validates the session in one step.
 * Returns both the client (for RLS queries) and the user.
 *
 * The middleware already blocks unauthenticated requests to /api/* routes,
 * but this provides a typed user object for route handlers that need it
 * (e.g., created_by fields) and the supabase client for data queries.
 */
export async function withAuth(): Promise<
  | { supabase: SupabaseClient; user: NonNullable<Awaited<ReturnType<SupabaseClient["auth"]["getSession"]>>["data"]["session"]>["user"]; error: null }
  | { supabase: null; user: null; error: NextResponse }
> {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return {
      supabase: null,
      user: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { supabase, user: session.user, error: null };
}

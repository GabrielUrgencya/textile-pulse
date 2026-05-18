import { createClient } from "@supabase/supabase-js";

/**
 * Supabase Admin client with service_role key.
 * Used ONLY for server-side operations that require elevated privileges,
 * such as PIN-based authentication where we need to generate sessions
 * for users without their password.
 *
 * WARNING: Never expose this client to the browser.
 */
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

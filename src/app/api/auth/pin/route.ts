import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limiter";

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "127.0.0.1";
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body?.tenantId || !body?.pin) {
    return NextResponse.json(
      { error: "tenantId and pin are required" },
      { status: 400 }
    );
  }

  const { tenantId, pin } = body as { tenantId: string; pin: string };
  const ip = getClientIp(request);
  const key = rateLimitKey(ip, tenantId);

  // Rate limit check
  const limit = checkRateLimit(key);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      {
        status: 429,
        headers: {
          "X-RateLimit-Remaining": "0",
          "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)),
        },
      }
    );
  }

  const headers = { "X-RateLimit-Remaining": String(limit.remaining) };

  // Fetch active profiles with PIN for this tenant
  const { data: profiles, error: fetchError } = await supabaseAdmin
    .from("profiles")
    .select("id, pin_code, full_name, role, email")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .not("pin_code", "is", null);

  if (fetchError || !profiles?.length) {
    return NextResponse.json(
      { error: "Invalid credentials" },
      { status: 401, headers }
    );
  }

  // Compare PIN against each profile (bcrypt)
  let matched: (typeof profiles)[0] | null = null;
  for (const p of profiles) {
    if (await bcrypt.compare(pin, p.pin_code!)) {
      matched = p;
      break;
    }
  }

  if (!matched) {
    return NextResponse.json(
      { error: "Invalid credentials" },
      { status: 401, headers }
    );
  }

  // Get the auth user to find their email
  const { data: userData, error: userError } =
    await supabaseAdmin.auth.admin.getUserById(matched.id);

  if (userError || !userData.user) {
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 500, headers }
    );
  }

  // Ensure tenant_id + role in app_metadata for RLS
  await supabaseAdmin.auth.admin.updateUserById(matched.id, {
    app_metadata: {
      ...userData.user.app_metadata,
      tenant_id: tenantId,
      role: matched.role,
    },
  });

  // Generate magic link and exchange for session
  const { data: linkData, error: linkError } =
    await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: userData.user.email!,
    });

  if (linkError || !linkData.properties?.hashed_token) {
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 500, headers }
    );
  }

  // Use the SSR server client to verify OTP — this automatically sets session cookies
  const supabaseServer = createSupabaseServerClient();
  const { data: session, error: verifyError } =
    await supabaseServer.auth.verifyOtp({
      type: "magiclink",
      token_hash: linkData.properties.hashed_token,
    });

  if (verifyError || !session.session) {
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 500, headers }
    );
  }

  return NextResponse.json(
    {
      user: {
        id: session.user!.id,
        full_name: matched.full_name,
        role: matched.role,
        tenant_id: tenantId,
      },
      session: {
        access_token: session.session.access_token,
        expires_at: session.session.expires_at,
      },
    },
    { headers }
  );
}

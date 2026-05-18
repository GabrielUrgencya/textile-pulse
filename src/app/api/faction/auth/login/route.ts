import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rate-limiter";

const COOKIE_NAME = "faction_session";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "127.0.0.1";
}

/**
 * POST /api/faction/auth/login
 * AC5: Validates token (UUID) + PIN (6 digits), creates HttpOnly session cookie.
 * AC8: Rate limited — 5 attempts / 15 min per IP + token.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body?.token || !body?.pin) {
    return NextResponse.json(
      { error: "token and pin are required" },
      { status: 400 }
    );
  }

  const { token, pin } = body as { token: string; pin: string };

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(token)) {
    return NextResponse.json({ error: "Invalid token format" }, { status: 400 });
  }

  // Rate limit: 5 attempts / 15 min per IP + token (AC8)
  const ip = getClientIp(request);
  const rateLimitKey = `faction:${ip}:${token}`;
  const limit = checkRateLimit(rateLimitKey);

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

  // Lookup active token using service_role (bypasses RLS)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: tokenRecord, error: tokenError } = await supabase
    .from("faction_tokens")
    .select("id, tenant_id, faction_id, pin_hash, name, is_active")
    .eq("token", token)
    .eq("is_active", true)
    .single();

  if (tokenError || !tokenRecord) {
    return NextResponse.json(
      { error: "Invalid credentials" },
      { status: 401, headers }
    );
  }

  // Compare PIN with bcrypt hash
  const pinValid = await bcrypt.compare(pin, tokenRecord.pin_hash);
  if (!pinValid) {
    return NextResponse.json(
      { error: "Invalid credentials" },
      { status: 401, headers }
    );
  }

  // Update last_accessed_at
  await supabase
    .from("faction_tokens")
    .update({ last_accessed_at: new Date().toISOString() })
    .eq("id", tokenRecord.id);

  // Create session cookie (HttpOnly, SameSite=Strict, Secure, max-age=30 days)
  const sessionPayload = JSON.stringify({ tokenId: tokenRecord.id });

  const response = NextResponse.json(
    {
      faction: {
        id: tokenRecord.faction_id,
        name: tokenRecord.name,
        tenantId: tokenRecord.tenant_id,
      },
    },
    { headers }
  );

  response.cookies.set(COOKIE_NAME, sessionPayload, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });

  return response;
}

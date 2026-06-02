import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Session duration: 8 hours (factory shift) */
const SESSION_MAX_AGE = 8 * 60 * 60; // 28800 seconds

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // --- Fast path: ALL API routes skip middleware auth ---
  // withAuth() in each route handler is the sole auth gate.
  // This eliminates duplicate Supabase client + getSession() per request.
  if (path.startsWith("/api/")) {
    return NextResponse.next();
  }

  // --- Fast path: portal has its own auth (faction tokens) ---
  if (path.startsWith("/portal")) {
    return NextResponse.next();
  }

  // --- Routes that need auth: create Supabase client and validate session ---
  const response = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll().map((c) => ({
            name: c.name,
            value: c.value,
          }));
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, {
              ...options,
              maxAge: SESSION_MAX_AGE,
              httpOnly: true,
              secure: process.env.NODE_ENV === "production",
              sameSite: "lax",
            });
          });
        },
      },
    }
  );

  // Validate session locally (JWT decode from cookies — no network call)
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  // --- Protect page routes ---
  const isLoginPage = path === "/login" || path.startsWith("/login/");

  // Unauthenticated user on protected page → redirect to login
  if (!isLoginPage && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirect", path);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated user on login page → redirect to dashboard
  if (isLoginPage && user) {
    const dashUrl = request.nextUrl.clone();
    dashUrl.pathname = "/dashboard";
    return NextResponse.redirect(dashUrl);
  }

  return response;
}

export const config = {
  matcher: [
    // Only match API routes and actual page routes — skip all static assets
    "/api/:path*",
    "/((?!_next/static|_next/image|favicon\\.ico|icons|manifest\\.json|monitoring|sw\\.js|workbox-).*)",
  ],
};

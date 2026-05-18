import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Session duration: 8 hours (factory shift) */
const SESSION_MAX_AGE = 8 * 60 * 60; // 28800 seconds

const PUBLIC_PAGES = ["/login"];

const PUBLIC_API_PREFIXES = [
  "/api/auth/login",
  "/api/auth/pin",
  "/api/auth/logout",
  "/api/kiosk/",
  "/api/faction/",
];

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const path = request.nextUrl.pathname;

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

  // Refresh session if expired
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // --- Protect API routes (except public auth/kiosk/faction endpoints) ---
  if (path.startsWith("/api/")) {
    const isPublicApi =
      path === "/api/health" ||
      PUBLIC_API_PREFIXES.some((prefix) => path.startsWith(prefix));

    if (!isPublicApi && !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return response;
  }

  // --- Protect page routes ---
  const isPublicPage = PUBLIC_PAGES.some(
    (p) => path === p || path.startsWith(p + "/")
  );

  // Portal has its own auth (faction tokens) — skip
  if (path.startsWith("/portal")) {
    return response;
  }

  // Unauthenticated user on protected page → redirect to login
  if (!isPublicPage && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirect", path);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated user on login page → redirect to dashboard
  if (isPublicPage && user) {
    const dashUrl = request.nextUrl.clone();
    dashUrl.pathname = "/dashboard";
    return NextResponse.redirect(dashUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/api/:path*",
    "/((?!_next/static|_next/image|favicon.ico|icons|manifest.json).*)",
  ],
};

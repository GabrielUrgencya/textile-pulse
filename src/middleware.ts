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

  // --- Fast path: kiosk/TV has its own auth (query string token) ---
  if (path.startsWith("/tv")) {
    return NextResponse.next();
  }

  // LISION Vendas TV has its own kiosk-token authorization.
  if (path === "/vendas/tv" || path.startsWith("/vendas/tv/")) {
    return NextResponse.next();
  }

  // --- Dev-only: preview de UI (loop visual da @ux); a página dá 404 em prod ---
  if (process.env.NODE_ENV !== "production" && path.startsWith("/meu-plano/preview")) {
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
  const isMainLoginPage = path === "/login" || path.startsWith("/login/");
  const isSalesLoginPage = path === "/vendas/login" || path.startsWith("/vendas/login/");
  const isLoginPage = isMainLoginPage || isSalesLoginPage;
  const isSalesPage = path === "/vendas" || path.startsWith("/vendas/");

  // Unauthenticated user on protected page → redirect to login
  if (!isLoginPage && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = isSalesPage ? "/vendas/login" : "/login";
    loginUrl.searchParams.set("redirect", path);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated user on login page → redirect to dashboard
  if (isLoginPage && user) {
    const dashUrl = request.nextUrl.clone();
    const requestedRedirect = request.nextUrl.searchParams.get("redirect");
    const safeRedirect = isSalesLoginPage
      ? requestedRedirect === "/vendas" || requestedRedirect?.startsWith("/vendas/")
        ? requestedRedirect
        : null
      : requestedRedirect?.startsWith("/") && !requestedRedirect.startsWith("//")
        ? requestedRedirect
        : null;
    dashUrl.pathname = isSalesLoginPage ? safeRedirect ?? "/vendas" : safeRedirect ?? "/dashboard";
    dashUrl.search = "";
    return NextResponse.redirect(dashUrl);
  }

  return response;
}

export const config = {
  matcher: [
    // Only match API routes and actual page routes — skip all static assets
    "/api/:path*",
    "/((?!_next/static|_next/image|favicon\\.ico|favicon-|apple-touch-icon|icons|brand|manifest\\.json|monitoring|sw\\.js|workbox-).*)",
  ],
};

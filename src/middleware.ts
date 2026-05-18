import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
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
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Refresh session if expired
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protect API routes (except auth endpoints)
  if (request.nextUrl.pathname.startsWith("/api/") && !isPublicRoute(request)) {
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  return response;
}

function isPublicRoute(request: NextRequest): boolean {
  const path = request.nextUrl.pathname;
  return (
    path.startsWith("/api/auth/login") ||
    path.startsWith("/api/auth/pin") ||
    path.startsWith("/api/auth/logout") ||
    path === "/api/health"
  );
}

export const config = {
  matcher: ["/api/:path*"],
};

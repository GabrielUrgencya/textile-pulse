import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const APP_VERSION = process.env.npm_package_version || "0.1.0";
const startTime = Date.now();

export async function GET() {
  const checks: Record<string, { status: string; latency_ms?: number }> = {};

  // Check Supabase DB connection
  const dbStart = Date.now();
  try {
    const { error } = await supabaseAdmin
      .from("tenants")
      .select("id")
      .limit(1)
      .single();

    // Even "no rows" means the connection works
    if (error && error.code !== "PGRST116") {
      checks.database = { status: "unhealthy", latency_ms: Date.now() - dbStart };
    } else {
      checks.database = { status: "healthy", latency_ms: Date.now() - dbStart };
    }
  } catch {
    checks.database = { status: "unhealthy", latency_ms: Date.now() - dbStart };
  }

  const allHealthy = Object.values(checks).every((c) => c.status === "healthy");

  return NextResponse.json(
    {
      status: allHealthy ? "healthy" : "degraded",
      version: APP_VERSION,
      uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: allHealthy ? 200 : 503 }
  );
}

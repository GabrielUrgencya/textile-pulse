import { NextResponse } from "next/server";
import { checkRateLimitCustom } from "@/lib/rate-limiter";
import {
  acknowledgeSalesTvCelebration,
  isValidSalesTvToken,
  loadSalesTvSnapshot,
  salesTvAckSchema,
  salesTvQuerySchema,
} from "@/lib/sales-tv-access";
import { salesTvRateLimitKey } from "@/lib/sales-tv-access.server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
  Vary: "Authorization",
} as const;
const neutral = { available: false } as const;

function tokenFrom(request: Request): string | null {
  const value = request.headers.get("authorization");
  if (!value?.startsWith("Bearer ")) return null;
  const token = value.slice(7);
  return isValidSalesTvToken(token) ? token : null;
}

function requestIp(request: Request): string {
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

function allowIp(ip: string): boolean {
  return checkRateLimitCustom(salesTvRateLimitKey(ip), 300, 60_000).allowed;
}

function allowToken(ip: string, token: string): boolean {
  return checkRateLimitCustom(salesTvRateLimitKey(ip, token), 90, 60_000)
    .allowed;
}

export async function GET(request: Request) {
  const ip = requestIp(request);
  if (!allowIp(ip)) {
    return NextResponse.json(neutral, {
      status: 404,
      headers: responseHeaders,
    });
  }
  const token = tokenFrom(request);
  if (!token || !allowToken(ip, token)) {
    return NextResponse.json(neutral, {
      status: 404,
      headers: responseHeaders,
    });
  }
  const query = salesTvQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success) {
    return NextResponse.json(neutral, {
      status: 404,
      headers: responseHeaders,
    });
  }
  const data = await loadSalesTvSnapshot(supabaseAdmin, {
    token,
    periodKey: query.data.periodKey,
    receipt: query.data.receipt,
  });
  return NextResponse.json(data, {
    status: data.available ? 200 : 404,
    headers: responseHeaders,
  });
}

export async function POST(request: Request) {
  const ip = requestIp(request);
  if (!allowIp(ip)) {
    return NextResponse.json(
      { accepted: true },
      { status: 202, headers: responseHeaders },
    );
  }
  const token = tokenFrom(request);
  if (!token || !allowToken(ip, token)) {
    return NextResponse.json(
      { accepted: true },
      { status: 202, headers: responseHeaders },
    );
  }
  let body: unknown;
  try {
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 1024) {
        await reader.cancel();
        body = null;
        break;
      }
      chunks.push(value);
    }
    if (body !== null) {
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      body = JSON.parse(new TextDecoder().decode(bytes));
    }
  } catch {
    body = null;
  }
  const parsed = salesTvAckSchema.safeParse(body);
  if (parsed.success) {
    await acknowledgeSalesTvCelebration(
      supabaseAdmin,
      token,
      parsed.data.receipt,
    );
  }
  return NextResponse.json(
    { accepted: true },
    { status: 202, headers: responseHeaders },
  );
}

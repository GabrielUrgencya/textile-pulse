import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const adapter = readFileSync("src/lib/sales-tv-access.ts", "utf8");
const route = readFileSync("src/app/api/vendas/tv/route.ts", "utf8");

assert.match(adapter, /sales_tv_kiosk_snapshot_v2/);
assert.match(adapter, /sales_tv_kiosk_ack_v2/);
assert.doesNotMatch(adapter, /sales_tv_snapshot_v1/);
assert.match(adapter, /\.strict\(\)/);
assert.match(adapter, /z\.enum\(\["BUILDING", "ALERT", "ACHIEVED"\]\)/);
assert.match(adapter, /z\.literal\("COLLECTIVE"\)/);
assert.match(adapter, /receipt_state: z\.literal\("PENDING"\)/);
assert.match(adapter, /receipt_state: z\.literal\("ACKNOWLEDGED"\)/);
assert.match(adapter, /createHash\("sha256"\)/);
assert.match(adapter, /token \? `\$\{ip\}\\0\$\{token\}` : ip/);
for (const forbidden of [
  "profile_id",
  "tenant_id",
  "realized_value",
  "target_value",
  "commission",
  "ticket",
]) {
  assert.doesNotMatch(adapter, new RegExp(forbidden));
}
assert.match(route, /supabaseAdmin/);
assert.match(route, /Authorization/);
assert.match(
  route,
  /Object\.fromEntries\(new URL\(request\.url\)\.searchParams\)/,
);
assert.match(route, /"Cache-Control": "no-store, max-age=0"/);
assert.match(route, /"Referrer-Policy": "no-referrer"/);
assert.match(route, /status: 202/);
assert.match(route, /salesTvRateLimitKey\(ip\),\s*300,\s*60_000/);
assert.match(route, /salesTvRateLimitKey\(ip, token\)/);
const getBody = route.slice(
  route.indexOf("export async function GET"),
  route.indexOf("export async function POST"),
);
assert.ok(
  getBody.indexOf("allowIp(ip)") < getBody.indexOf("tokenFrom(request)"),
);
assert.ok(
  getBody.indexOf("allowToken(ip, token)") <
    getBody.indexOf("salesTvQuerySchema.safeParse"),
);
const postBody = route.slice(route.indexOf("export async function POST"));
assert.ok(
  postBody.indexOf("allowIp(ip)") < postBody.indexOf("tokenFrom(request)"),
);
assert.ok(
  postBody.indexOf("allowToken(ip, token)") <
    postBody.indexOf("request.body?.getReader()"),
);
assert.match(route, /request\.body\?\.getReader\(\)/);
assert.match(route, /total > 1024/);
assert.match(route, /await reader\.cancel\(\)/);
assert.doesNotMatch(route, /request\.json\(\)|status: 429|Retry-After/);
assert.ok((route.match(/status: 404/g) ?? []).length >= 2);
assert.doesNotMatch(
  route,
  /console\.|createSupabaseServerClient|tenantId|profileId|actorId/,
);

console.log(
  "PASS: sales TV public API uses strict v2 service-role contracts, neutral responses and safe throttling.",
);

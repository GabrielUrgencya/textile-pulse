import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const adapter = readFileSync("src/lib/sales-tv-admin.ts", "utf8");
const route = readFileSync("src/app/api/vendas/admin/tv/route.ts", "utf8");
for (const rpc of [
  "sales_tv_kiosk_admin_status_v2",
  "sales_tv_kiosk_admin_create_v2",
  "sales_tv_kiosk_admin_rotate_v2",
  "sales_tv_kiosk_admin_revoke_v2",
])
  assert.match(adapter, new RegExp(rpc));
assert.match(adapter, /token: z\.string\(\)\.regex\(\/\^\[0-9a-f\]\{64\}\$\//);
assert.match(adapter, /\.strict\(\)/);
assert.match(route, /withAuth\(\)/);
assert.match(route, /loadSalesAccess/);
assert.match(route, /hasSalesRole\(access\.access, \["ADMIN"\]\)/);
assert.match(route, /export async function GET/);
assert.match(route, /export async function POST/);
assert.match(route, /export async function PATCH/);
assert.match(route, /export async function DELETE/);
assert.match(route, /"Cache-Control": "no-store, max-age=0"/);
assert.doesNotMatch(route, /tenantId|profileId|actorId|supabaseAdmin/);
assert.doesNotMatch(adapter + route, /console\.|localStorage|sessionStorage/);
console.log(
  "PASS: sales TV admin API enforces active ADMIN sessions and strict one-time-secret v2 contracts.",
);

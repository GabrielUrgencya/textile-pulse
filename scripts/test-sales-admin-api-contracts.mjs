import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const adapter = read("src/lib/sales-admin.ts");
const api = read("src/lib/sales-admin-api.ts");
const routes = [
  read("src/app/api/vendas/admin/directory/route.ts"),
  read("src/app/api/vendas/admin/memberships/route.ts"),
  read("src/app/api/vendas/admin/payment-methods/route.ts"),
  read("src/app/api/vendas/admin/payment-methods/reorder/route.ts"),
];

for (const rpc of [
  "sales_admin_directory_v1",
  "sales_admin_set_membership_v1",
  "sales_admin_payment_methods_v1",
  "sales_admin_set_payment_method_v1",
  "sales_admin_reorder_payment_methods_v1",
]) {
  assert.match(adapter, new RegExp(`rpc\\(\\s*[\"']${rpc}[\"']`));
}

assert.match(api, /withAuth\(\)/);
assert.match(api, /code: "UNAUTHORIZED"/);
assert.match(api, /code: "INVALID_INPUT"/);
assert.match(adapter, /\.strict\(\)/);
assert.match(adapter, /new Set\(orderedMethodIds\)/);
assert.match(adapter, /p_expected_order_revision/);
assert.match(adapter, /p_idempotency_key/);
assert.match(adapter, /ORDER_REVISION_CONFLICT/);
assert.match(adapter, /details: parseOrderDetails|const details = parseOrderDetails/);

for (const source of [adapter, api, ...routes]) {
  assert.doesNotMatch(source, /p_tenant_id|p_actor_id|\.from\(/);
  assert.doesNotMatch(source, /export async function DELETE/);
}

assert.match(routes[0], /export async function GET/);
assert.match(routes[1], /export async function PUT/);
assert.match(routes[2], /export async function GET/);
assert.match(routes[2], /export async function PUT/);
assert.match(routes[3], /export async function PUT/);

console.log("PASS: sales admin API session, validation and RPC contracts verified.");

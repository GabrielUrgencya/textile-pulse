import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const adapter = read("src/lib/sales-admin-configuration.ts");
const routes = ["configuration", "holidays", "periods", "goals", "goal-assignments"].map((name) => read(`src/app/api/vendas/admin/${name}/route.ts`));

for (const rpc of ["sales_admin_configuration_v1", "sales_admin_set_config_v1", "sales_admin_set_holiday_v1", "sales_admin_set_period_v1", "sales_admin_set_goal_v1", "sales_admin_set_goal_assignment_v1"]) assert.match(adapter, new RegExp(`rpc\\(\\s*[\"']${rpc}[\"']`));
assert.match(adapter, /\.strict\(\)/);
assert.match(adapter, /STALE_REVISION/);
assert.match(adapter, /CLOSED_PERIOD/);
assert.match(adapter, /OVERLAPPING_PERIOD/);
for (const source of [adapter, ...routes]) {
  assert.doesNotMatch(source, /p_tenant_id|p_actor_id|\.from\(/);
  assert.doesNotMatch(source, /export async function DELETE|sales_admin_(?:close|reset)|\.rpc\(\s*["']sales_(?:close|reset)/i);
}
assert.match(routes[0], /export async function GET/);
for (const route of routes) assert.match(route, /export async function PUT/);
console.log("PASS: sales admin configuration API contracts verified.");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const adapter = read("src/lib/sales-admin-sales.ts");
const api = [
  "src/app/api/vendas/admin/dashboard/route.ts",
  "src/app/api/vendas/admin/sales/route.ts",
  "src/app/api/vendas/admin/sales/[saleId]/route.ts",
  "src/app/api/vendas/admin/sales/[saleId]/cancel/route.ts",
].map(read).join("\n");
const migration = read("prisma/migrations/20260812140000_sales_admin_dashboard_sales/migration.sql");

for (const rpc of ["sales_admin_dashboard_v2", "sales_admin_list_sales_v1", "sales_admin_sale_detail_v1", "sales_admin_upsert_sale_v2", "sales_admin_cancel_sale_v2"]) {
  assert.match(adapter + migration, new RegExp(rpc), `${rpc} must be wired`);
}
assert.match(adapter, /\.strict\(\)/, "request contracts must reject extra fields");
assert.doesNotMatch(adapter + api, /tenantId|actorId|p_tenant|p_actor/, "client contracts must never accept tenant or actor");
assert.doesNotMatch(api, /export async function DELETE|method:\s*["']DELETE/, "physical deletion must not exist");
assert.match(api, /requireSalesAdminSession/g, "every handler must derive an authenticated server session");
assert.match(migration, /sp\.status='OPEN'/, "mutations must be guarded by open period state");
assert.match(migration, /sales_mutation_requests/, "mutations must have an idempotency ledger");
assert.match(migration, /revision/, "mutations must enforce revision concurrency");

console.log("PASS sales admin sales API: strict session-derived RPC adapters, no tenant/actor/DELETE, revision and idempotency wired");

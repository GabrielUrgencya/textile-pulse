import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const adapter = await read("src/lib/sales-consultant.ts");
const api = await read("src/lib/sales-consultant-api.ts");
const salesRoute = await read("src/app/api/vendas/consultant/sales/route.ts");
const detailRoute = await read("src/app/api/vendas/consultant/sales/[saleId]/route.ts");
const dashboardRoute = await read("src/app/api/vendas/consultant/dashboard/route.ts");
const celebrationRoute = await read("src/app/api/vendas/consultant/celebration/route.ts");

for (const rpc of ["sales_consultant_upsert_sale_v1", "sales_consultant_list_sales_v1", "sales_consultant_sale_detail_v1", "sales_consultant_dashboard_v1", "sales_consultant_claim_celebration_v1"]) {
  assert.match(adapter, new RegExp(rpc), `${rpc} must be consumed`);
}
assert.doesNotMatch(adapter, /p_(tenant|actor|profile|consultant_profile)_id\s*:/i, "identity and tenant must not come from app inputs");
assert.match(adapter, /\.strict\(\)/, "request contracts must reject extra fields");
assert.match(adapter, /sales_stale_revision/, "revision conflicts need a canonical mapping");
assert.match(adapter, /sales_idempotency_mismatch/, "idempotency mismatch needs a canonical mapping");
assert.match(api, /loadSalesAccess\(auth\.supabase, auth\.user\)/, "all consultant routes need a session-derived role gate");
assert.match(api, /hasSalesRole\(access\.access, \["CONSULTANT"\]\)/, "non-consultant sessions must be rejected before data access");
assert.match(adapter, /z\.number\(\)\.finite\(\)/, "numeric contracts must reject non-finite values");
assert.match(adapter, /regex\(\/\^-\?/, "numeric strings must use a strict decimal grammar");
assert.match(adapter, /available_periods: z\.array/, "dashboard must validate the canonical period catalog");
assert.match(adapter, /average_per_business_day: money/, "dashboard must validate the canonical business-day average");
assert.match(adapter, /z\.discriminatedUnion\("allowed"/, "collective payload must not leak values when disabled");
assert.ok(detailRoute.indexOf("requireConsultantSession()") < detailRoute.indexOf("UUID.test"), "authentication must precede route identifier validation");
assert.match(salesRoute, /saleId !== null/, "create route must reject edit payloads");
assert.match(detailRoute, /saleId !== params\.saleId/, "route and body ids must match");
assert.match(dashboardRoute, /consultantDashboardFiltersSchema/, "dashboard filters must be strict");
assert.match(celebrationRoute, /consultantCelebrationInputSchema/, "celebration accepts the period contract only");
assert.doesNotMatch([salesRoute, detailRoute, dashboardRoute, celebrationRoute].join("\n"), /tenant|actorId|profileId|consultantProfileId/, "routes must not expose identity selectors");

console.log("PASS: consultant API uses session-derived canonical RPC contracts with strict inputs.");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(path, "utf8");
const adapter = read("src/lib/sales-period-close.ts");
const routes = ["preview", "commit", "recovery"].map((name) => read(`src/app/api/vendas/admin/period-close/${name}/route.ts`));
for (const rpc of ["sales_close_preview_v2", "sales_close_period_v2", "sales_close_recovery_v1"]) assert.match(adapter, new RegExp(`rpc\\(\\s*["']${rpc}["']`));
for (const schema of ["salesClosePreviewInputSchema", "salesCloseCommitInputSchema", "salesCloseRecoveryInputSchema"]) assert.match(adapter, new RegExp(`${schema} = z\\.object`));
assert.equal((adapter.match(/\.strict\(\)/g) ?? []).length, 3);
for (const source of [adapter, ...routes]) { assert.doesNotMatch(source, /tenantId|actorId|p_tenant_id|p_actor_id|\.from\(/); assert.doesNotMatch(source, /export async function (?:GET|PUT|DELETE|PATCH)/); }
for (const route of routes) { assert.match(route, /requireSalesAdminSession/); assert.match(route, /parseSalesAdminBody/); assert.match(route, /export async function POST/); }
for (const code of ["STALE_PREVIEW", "OVERLAPPING_PERIOD", "IDEMPOTENCY_MISMATCH", "PERIOD_ALREADY_CLOSED", "FORBIDDEN"]) assert.ok(adapter.includes(code));
assert.match(adapter, /periodRevision: z\.string\(\)\.regex\(\/\^\[0-9a-f\]\{64\}\$\//);
assert.match(adapter, /periodRevision: text\(data\.period_revision\)/);
assert.ok(adapter.includes("NEXT_PERIOD_NOT_EMPTY"));
assert.match(adapter, /p_expected_revision: input\.periodRevision/); assert.match(adapter, /p_idempotency_key: input\.idempotencyKey/);
console.log("PASS: period-close API is strict, session-derived and mapped to canonical RPCs.");

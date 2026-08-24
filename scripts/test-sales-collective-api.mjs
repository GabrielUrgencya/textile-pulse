import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const adapter = await read("src/lib/sales-collective.ts");
const route = await read("src/app/api/vendas/collective/route.ts");
assert.match(adapter, /sales_collective_summary_v2/);
assert.doesNotMatch(adapter, /sales_collective_summary_v1/);
assert.match(adapter, /z\.discriminatedUnion\("allowed"/);
assert.match(adapter, /\.strict\(\)/);
assert.match(adapter, /\^\[0-9a-f\]\{64\}\$/);
assert.match(adapter, /z\.array\(goal\)\.length\(6\)/);
assert.match(adapter, /has_suppressed_buckets/);
assert.match(adapter, /progress_percent: decimal\.nullable\(\)/);
for (const forbidden of [
  "profile_id",
  "user_id",
  "display_name",
  "avatar",
  "realized_value",
  "payment_method_id",
  "goal_id",
  "stable_order",
])
  assert.doesNotMatch(adapter, new RegExp(forbidden));
assert.match(route, /withAuth\(\)/);
assert.match(route, /loadSalesAccess\(auth\.supabase, auth\.user\)/);
assert.match(route, /\["ADMIN", "CONSULTANT"\]/);
assert.match(route, /Cache-Control": "no-store"/);
assert.doesNotMatch(route, /tenant|actorId|profileId/);
assert.match(route, /collectiveQuerySchema\.safeParse/);
console.log(
  "PASS: collective API uses strict sanitized v2 DTO with session-derived role and no-store responses.",
);

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(
    "prisma/migrations/20260808190000_sales_goal_provisioning_key/migration.sql",
  ),
  "utf8",
);
const rollback = readFileSync(
  resolve(
    "prisma/migrations/20260808190000_sales_goal_provisioning_key/rollback.sql",
  ),
  "utf8",
);
const foundation = readFileSync(
  resolve("prisma/migrations/20260808150000_lision_sales_foundation/migration.sql"),
  "utf8",
);

assert.match(migration, /ADD COLUMN provisioning_key text;/);
assert.match(
  migration,
  /provisioning_key IN \(\s*'META_1',\s*'META_2',\s*'META_3',\s*'CHALLENGE',\s*'QUARTERLY',\s*'COLLECTIVE'\s*\)/,
  "only canonical manifest keys may be persisted",
);
assert.match(
  migration,
  /CREATE UNIQUE INDEX sales_goals_tenant_provisioning_key_key[\s\S]*ON public\.sales_goals \(tenant_id, provisioning_key\)[\s\S]*WHERE provisioning_key IS NOT NULL;/,
  "canonical keys must be unique per tenant without restricting custom NULL goals",
);
assert.match(
  migration,
  /OLD\.provisioning_key IS NOT NULL[\s\S]*NEW\.provisioning_key IS DISTINCT FROM OLD\.provisioning_key/,
  "an adopted key cannot be changed or removed",
);
assert.doesNotMatch(
  migration,
  /OLD\.provisioning_key IS NULL[\s\S]*RAISE EXCEPTION/,
  "a legacy NULL key must remain adoptable",
);
assert.match(
  migration,
  /REVOKE ALL ON FUNCTION public\.sales_goal_provisioning_key_immutable\(\) FROM PUBLIC;/,
);
assert.doesNotMatch(
  foundation,
  /provisioning_key/,
  "the already-applied foundation migration must remain unchanged",
);

for (const rollbackStep of [
  /DROP TRIGGER IF EXISTS sales_goal_provisioning_key_immutable_trigger/,
  /DROP FUNCTION IF EXISTS public\.sales_goal_provisioning_key_immutable\(\);/,
  /DROP INDEX IF EXISTS public\.sales_goals_tenant_provisioning_key_key;/,
  /DROP CONSTRAINT IF EXISTS sales_goals_provisioning_key_check/,
  /DROP COLUMN IF EXISTS provisioning_key;/,
]) {
  assert.match(rollback, rollbackStep);
}

console.log("sales goal provisioning key structural tests: PASS");

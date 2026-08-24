import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(resolve(
  "prisma/migrations/20260812120000_sales_admin_memberships_payment_methods/migration.sql",
), "utf8");
const rollback = readFileSync(resolve(
  "prisma/migrations/20260812120000_sales_admin_memberships_payment_methods/rollback.sql",
), "utf8");
const foundation = readFileSync(resolve(
  "prisma/migrations/20260808150000_lision_sales_foundation/migration.sql",
), "utf8");

for (const functionName of [
  "sales_admin_directory_v1",
  "sales_admin_set_membership_v1",
  "sales_admin_payment_methods_v1",
  "sales_admin_set_payment_method_v1",
  "sales_admin_reorder_payment_methods_v1",
]) {
  assert.match(migration, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${functionName}\\b`));
}

assert.match(migration, /v_tenant uuid := public\.auth_tenant_id\(\)/);
assert.match(migration, /v_actor uuid := auth\.uid\(\)/);
assert.match(migration, /NOT public\.sales_is_admin\(\)/);
assert.doesNotMatch(migration, /p_tenant_id|user_metadata/i);
assert.doesNotMatch(migration, /ALTER (?:POLICY|TABLE) public\.profiles/i);
assert.doesNotMatch(migration, /CREATE OR REPLACE FUNCTION public\.sales_my_access_v1/);

assert.match(migration, /GENERATED ALWAYS AS[\s\S]*sales_normalize_payment_method_name/);
assert.match(migration, /UNIQUE \(tenant_id, name_normalized\)/);
assert.match(migration, /sales_payment_method_legacy_normalized_name_conflict/);
assert.match(migration, /sales_require_active_payment_method_for_new_sale_trigger/);
assert.match(migration, /sales_payment_method_inactive_or_not_found/);
assert.match(migration, /sales_last_active_admin/);
assert.match(migration, /pg_advisory_xact_lock/);
assert.match(migration, /jsonb_build_object\('before', v_before, 'after'/);
assert.doesNotMatch(migration, /SELECT\s+to_jsonb\([^)]+\),\s*\w+\s+INTO\s+\w+,\s*\w+/i,
  "PostgreSQL rejects mixed scalar/composite SELECT INTO targets");
assert.ok((migration.match(/jsonb_populate_record\(NULL::public\.sales_(?:memberships|payment_methods), v_before\)/g) ?? []).length === 3,
  "row variables must be reconstructed explicitly after locking their JSON snapshot");
assert.doesNotMatch(migration, /\bDELETE\s+FROM\s+public\.sales_(?:memberships|payment_methods)/i);

assert.match(migration, /p_ordered_method_ids uuid\[\]/);
assert.match(migration, /p_expected_order_revision bigint/);
assert.match(migration, /p_idempotency_key text/);
assert.match(migration, /cardinality\(p_ordered_method_ids\)/);
assert.match(migration, /count\(DISTINCT x\)/);
assert.match(migration, /ORDER BY spm\.sort_order, spm\.name_normalized, spm\.id/);
assert.match(migration, /WITH ORDINALITY/);
assert.match(migration, /sales_payment_method_order_revision_conflict/);
assert.match(migration, /sales_idempotency_key_payload_conflict/);
assert.match(migration, /SALES_PAYMENT_METHODS_REORDERED/);

for (const signature of [
  "sales_admin_directory_v1\\(\\)",
  "sales_admin_set_membership_v1\\(uuid, public\\.\"SalesMemberRole\", boolean\\)",
  "sales_admin_payment_methods_v1\\(\\)",
  "sales_admin_set_payment_method_v1\\(uuid, text, boolean\\)",
  "sales_admin_reorder_payment_methods_v1\\(uuid\\[\\], bigint, text\\)",
]) {
  assert.match(migration, new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${signature} FROM PUBLIC, anon;`));
  assert.match(migration, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${signature} TO authenticated;`));
}

assert.doesNotMatch(
  foundation,
  /sales_admin_set_membership_v1|name_normalized|sales_payment_method_order_states/,
  "the already-applied foundation migration must remain unchanged",
);

for (const rollbackStep of [
  /DROP FUNCTION IF EXISTS public\.sales_admin_reorder_payment_methods_v1/,
  /DROP TABLE IF EXISTS public\.sales_payment_method_reorder_requests/,
  /DROP TABLE IF EXISTS public\.sales_payment_method_order_states/,
  /DROP COLUMN IF EXISTS name_normalized/,
  /ADD CONSTRAINT sales_payment_methods_tenant_name_key UNIQUE \(tenant_id, name\)/,
  /DROP FUNCTION IF EXISTS public\.sales_normalize_payment_method_name/,
  /DROP TRIGGER IF EXISTS sales_require_active_payment_method_for_new_sale_trigger/,
]) {
  assert.match(rollback, rollbackStep);
}

console.log("sales admin membership/payment method structural tests: PASS");

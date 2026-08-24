import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration=readFileSync(resolve("prisma/migrations/20260812140000_sales_admin_dashboard_sales/migration.sql"),"utf8");
const rollback=readFileSync(resolve("prisma/migrations/20260812140000_sales_admin_dashboard_sales/rollback.sql"),"utf8");
for(const fn of ["sales_admin_dashboard_v2","sales_admin_list_sales_v1","sales_admin_upsert_sale_v2","sales_admin_cancel_sale_v2"])assert.match(migration,new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\b`));
assert.match(migration,/sales_metrics_internal_v1/);
assert.match(migration,/s\.status='CLOSED'/);
assert.match(migration,/s\.status='OPEN'/);
assert.match(migration,/CASE WHEN \(v_metrics->>'sales_count'\)::numeric=0 THEN 0/);
assert.match(migration,/CASE WHEN \(v_metrics->>'pieces_total'\)::numeric=0 THEN 0/);
assert.match(migration,/'installments',v_installments/);
assert.match(migration,/'closed',COALESCE\(jsonb_agg[\s\S]*FILTER\(WHERE x\.status='CLOSED'\)/);
assert.match(migration,/'open',COALESCE\(jsonb_agg[\s\S]*FILTER\(WHERE x\.status='OPEN'\)/);
assert.match(migration,/p_page_size NOT BETWEEN 1 AND 100/);
assert.match(migration,/p_sort NOT IN\('sold_at','pv_number','sale_value','status'\)/);
assert.match(migration,/ORDER BY[\s\S]*s\.id ASC LIMIT p_page_size/);
for(const sort of ["sold_at","pv_number","sale_value","status"]){
  assert.match(migration,new RegExp(`p_sort='${sort}'[\\s\\S]*lower\\(p_direction\\)='asc'`));
  assert.match(migration,new RegExp(`p_sort='${sort}'[\\s\\S]*lower\\(p_direction\\)='desc'`));
}
assert.match(migration,/s\.id ASC LIMIT p_page_size/);
assert.match(migration,/ADD COLUMN revision bigint/);
assert.match(migration,/sales_stale_revision/);
assert.match(migration,/sales_idempotency_mismatch/);
for(const field of ["consultant_profile_id","pv_number","sale_value","freight_value","discount_value","payment_method_id","installments","sets_count","loose_pieces_count","invoice_number","status","sold_at","expected_revision"]){
  assert.match(migration,new RegExp(`'${field}'`),`upsert fingerprint must contain ${field}`);
}
assert.match(migration,/sp\.status='OPEN'/);
assert.match(migration,/sales_invalid_payment_method/);
assert.match(migration,/sales_ineligible_consultant/);
assert.match(migration,/jsonb_build_object\('before',v_before,'after',v_after/);
assert.match(migration,/event_already_existed/);
assert.doesNotMatch(migration,/\bDELETE\s+FROM\s+public\.sales\b/i);
for(const match of migration.matchAll(/CREATE OR REPLACE FUNCTION public\.(sales_admin_[^(]+)\(([\s\S]*?)\)\s*RETURNS/g))assert.doesNotMatch(match[2],/tenant_id/i);
assert.match(migration,/REVOKE ALL ON public\.sales_mutation_requests FROM PUBLIC,anon,authenticated/);
assert.match(rollback,/DROP TABLE IF EXISTS public\.sales_mutation_requests/);
assert.match(rollback,/DROP COLUMN IF EXISTS revision/);
console.log("sales admin dashboard/sales structural tests: PASS");

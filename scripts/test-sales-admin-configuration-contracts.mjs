import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(resolve("prisma/migrations/20260812130000_sales_admin_configuration_goals/migration.sql"), "utf8");
const rollback = readFileSync(resolve("prisma/migrations/20260812130000_sales_admin_configuration_goals/rollback.sql"), "utf8");
const foundation = readFileSync(resolve("prisma/migrations/20260808150000_lision_sales_foundation/migration.sql"), "utf8");

for (const fn of ["sales_admin_configuration_v1", "sales_admin_set_config_v1", "sales_admin_set_holiday_v1", "sales_admin_set_period_v1", "sales_admin_set_goal_v1", "sales_admin_set_goal_assignment_v1", "sales_metrics_internal_v1", "sales_metrics_v1", "sales_my_dashboard_v1", "sales_admin_dashboard_v1", "sales_collective_summary_v1", "sales_tv_snapshot_v1"]) {
  assert.match(migration, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\b`));
}
assert.match(migration, /v_tenant uuid\s*:=\s*public\.auth_tenant_id\(\)/);
assert.match(migration, /v_actor uuid\s*:=\s*auth\.uid\(\)/);
for (const match of migration.matchAll(/CREATE OR REPLACE FUNCTION public\.(sales_admin_[^(]+)\(([\s\S]*?)\)\s*RETURNS/g)) {
  assert.doesNotMatch(match[2], /p_tenant_id/i, `${match[1]} must not accept tenant authority`);
}
assert.doesNotMatch(migration, /sales_close_period_v1|PERIOD_CLOSED|RESET/i, "10.4B must not close or reset periods");
assert.match(migration, /sales_closed_period_immutable/);
assert.match(migration, /sales_overlapping_period/);
assert.match(migration, /sales_duplicate_holiday/);
assert.match(migration, /sales_duplicate_goal_identity/);
assert.match(migration, /sales_ineligible_assignee/);
assert.match(migration, /sales_stale_revision/);
assert.match(migration, /pg_advisory_xact_lock/);
assert.match(migration, /target_value_snapshot/);
assert.match(migration, /commission_percent_snapshot/);
for (const snapshot of ["goal_name_snapshot", "goal_scope_snapshot", "goal_sort_order_snapshot", "goal_is_challenge_snapshot", "valid_from_snapshot", "valid_until_snapshot"]) assert.match(migration, new RegExp(snapshot));
assert.match(migration, /sp\.status='OPEN'/);
assert.match(migration, /sga\.target_value_snapshot<=v_real/);
assert.match(migration, /ORDER BY sga\.target_value_snapshot DESC/);
assert.match(migration, /WHEN v_collective=0 THEN 0/);
assert.match(migration, /sh\.is_active/);
assert.match(migration, /p_tenant_id<>v_auth_tenant/);
assert.match(migration, /p_profile_id IS DISTINCT FROM v_actor AND v_role<>'ADMIN'/);
assert.match(migration, /sales_metrics_access_denied/);
assert.match(migration, /REVOKE EXECUTE ON FUNCTION public\.sales_metrics_legacy_10_1\(uuid,uuid,uuid,date\) FROM PUBLIC,anon,authenticated;/);
assert.match(migration, /REVOKE EXECUTE ON FUNCTION public\.sales_metrics_v1\(uuid,uuid,uuid,date\) FROM PUBLIC,anon,authenticated;/);
assert.match(migration, /REVOKE EXECUTE ON FUNCTION public\.sales_metrics_internal_v1\(uuid,uuid,uuid,date\) FROM PUBLIC,anon,authenticated;/);
assert.doesNotMatch(migration, /GRANT EXECUTE ON FUNCTION[^;]*sales_metrics_(?:v1|legacy_10_1)/);
assert.doesNotMatch(migration, /GRANT EXECUTE ON FUNCTION[^;]*sales_metrics_internal_v1/);
for (const wrapper of ["sales_my_dashboard_v1", "sales_admin_dashboard_v1", "sales_collective_summary_v1", "sales_tv_snapshot_v1"]) {
  const body = migration.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${wrapper}\\([\\s\\S]*?\\$\\$;`))?.[0] ?? "";
  assert.match(body, /sales_metrics_internal_v1/, `${wrapper} must call the private core`);
  assert.doesNotMatch(body, /sales_metrics_v1\(/, `${wrapper} must not call the guarded direct contract`);
}
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.sales_collective_summary_v1[\s\S]*sales_membership_role\(\) IS NULL/);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.sales_tv_snapshot_v1[\s\S]*kt\.scope='sales_tv'/);
assert.doesNotMatch(migration, /JOIN public\.sales_goals sg[\s\S]*sga\.goal_scope_snapshot/, "metrics must not depend on mutable goal metadata");
assert.match(migration, /sales_goal_outside_period_validity/);
assert.match(migration, /valid_from_snapshot IS NULL OR sga\.valid_from_snapshot<=v_end/);
assert.match(migration, /jsonb_build_object\('before',v_before,'after',v_after/);
assert.doesNotMatch(migration, /\bDELETE\s+FROM\s+public\.sales_/i);
assert.doesNotMatch(foundation, /target_value_snapshot|sales_admin_set_config_v1/, "applied foundation remains unchanged");

const commitAt = migration.lastIndexOf("COMMIT;");
for (const fn of ["sales_admin_set_holiday_v1", "sales_admin_set_period_v1"]) assert.ok(migration.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}`) < commitAt);
for (const step of [/sales_metrics_legacy_10_1/, /DROP COLUMN IF EXISTS target_value_snapshot/, /DROP COLUMN IF EXISTS revision/, /DROP COLUMN IF EXISTS is_active/]) assert.match(rollback, step);

const rollbackRenameAt = rollback.indexOf("ALTER FUNCTION public.sales_metrics_legacy_10_1(uuid,uuid,uuid,date) RENAME TO sales_metrics_v1;");
const rollbackInternalDropAt = rollback.indexOf("DROP FUNCTION IF EXISTS public.sales_metrics_internal_v1(uuid,uuid,uuid,date);");
assert.ok(rollbackRenameAt >= 0 && rollbackRenameAt < rollbackInternalDropAt, "rollback must restore the 10.1 metrics core before removing the 10.4B internal core");
for (const wrapper of ["sales_my_dashboard_v1", "sales_admin_dashboard_v1", "sales_collective_summary_v1", "sales_tv_snapshot_v1"]) {
  const wrapperAt = rollback.indexOf(`CREATE OR REPLACE FUNCTION public.${wrapper}`);
  const body = rollback.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${wrapper}\\([\\s\\S]*?\\$\\$;`))?.[0] ?? "";
  assert.ok(wrapperAt > rollbackRenameAt && wrapperAt < rollbackInternalDropAt, `${wrapper} must be restored before the internal core is dropped`);
  assert.match(body, /sales_metrics_v1\(/, `${wrapper} must call the restored 10.1 metrics core`);
  assert.doesNotMatch(body, /sales_metrics_internal_v1/, `${wrapper} must not retain the removed internal dependency`);
}
assert.match(rollback, /REVOKE EXECUTE ON FUNCTION public\.sales_metrics_v1\(uuid,uuid,uuid,date\) FROM PUBLIC,anon;[\s\S]*GRANT EXECUTE ON FUNCTION public\.sales_metrics_v1\(uuid,uuid,uuid,date\) TO authenticated;/);
for (const wrapper of ["sales_my_dashboard_v1", "sales_admin_dashboard_v1", "sales_collective_summary_v1"]) {
  assert.match(rollback, new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${wrapper}\\(uuid\\) FROM PUBLIC,anon;`));
  assert.match(rollback, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${wrapper}\\(uuid\\) TO authenticated;`));
}
assert.match(rollback, /REVOKE EXECUTE ON FUNCTION public\.sales_tv_snapshot_v1\(uuid,uuid\) FROM PUBLIC;/);
assert.match(rollback, /GRANT EXECUTE ON FUNCTION public\.sales_tv_snapshot_v1\(uuid,uuid\) TO anon,authenticated;/);
assert.doesNotMatch(rollback, /\b(?:DELETE|UPDATE|INSERT)\s+(?:INTO\s+)?public\.(?:kiosk_tokens|sales_memberships)\b/i, "rollback must preserve TV tokens and memberships");

console.log("sales admin configuration/goal structural tests: PASS");

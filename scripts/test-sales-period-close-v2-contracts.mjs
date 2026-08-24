import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(resolve("prisma/migrations/20260812150000_sales_period_close_v2/migration.sql"), "utf8");
const rollback = readFileSync(resolve("prisma/migrations/20260812150000_sales_period_close_v2/rollback.sql"), "utf8");
const token = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

for (const fn of ["sales_close_material_write_guard_v1", "sales_close_preview_revision_v1", "sales_close_preview_v2", "sales_close_period_v2", "sales_close_recovery_v1", "sales_close_period_v1"]) assert.match(migration, new RegExp(`FUNCTION public\\.${fn}\\b`));
assert.match(migration, /ADD COLUMN request jsonb/);
assert.match(migration, /ADD COLUMN result jsonb/);
assert.match(migration, /ADD COLUMN next_period_id uuid/);
assert.match(migration, /sales_period_closure_immutable/);
assert.match(migration, /sales_period_close_requests/);
assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /REVOKE ALL ON public\.sales_period_close_requests FROM PUBLIC,anon,authenticated/);

assert.match(migration, /to_regprocedure\('extensions\.digest\(bytea,text\)'\)/);
assert.match(migration, /sales_close_requires_extensions_digest_sha256/);
assert.match(migration, /sales_close_preview_revision_v1\(p_tenant_id uuid,p_period_id uuid\)\s*\nRETURNS text/);
assert.match(migration, /extensions\.digest\([\s\S]*'sha256'\)/);
assert.match(migration, /encode\([\s\S]*,'hex'\)/);
assert.match(migration, /REVOKE ALL ON FUNCTION public\.sales_close_preview_revision_v1\(uuid,uuid\) FROM PUBLIC,anon,authenticated/);
for (const source of ["'as_of'", "'period'", "'sales'", "'config'", "'assignments'", "'holidays'"]) assert.ok(migration.includes(source), `${source} must participate in the preview token`);
assert.match(migration, /now\(\) AT TIME ZONE COALESCE\(\(SELECT sc\.timezone/);
for (const saleField of ["'revision',s.revision", "'status',s.status", "'sale_value',s.sale_value", "'freight_value',s.freight_value", "'discount_value',s.discount_value", "'pieces_total',s.pieces_total", "'payment_method_id',s.payment_method_id"]) assert.ok(migration.includes(saleField), `${saleField} must participate in the preview token`);
for (const assignmentField of ["'target_value_snapshot',sga.target_value_snapshot", "'commission_percent_snapshot',sga.commission_percent_snapshot", "'goal_revision',sga.goal_revision", "'revision',sga.revision"]) assert.ok(migration.includes(assignmentField), `${assignmentField} must participate in the preview token`);
assert.match(migration, /jsonb_agg\([\s\S]*ORDER BY s\.id/);
assert.match(migration, /jsonb_agg\([\s\S]*ORDER BY sga\.id/);
assert.match(migration, /jsonb_agg\([\s\S]*ORDER BY sh\.date,sh\.id/);

const fixture = { as_of: "2026-08-13", period: { revision: 1 }, sales: [{ id: "s1", revision: 1, sale_value: "10.00" }], config: { revision: 1 }, assignments: [{ id: "a1", revision: 1, target_value_snapshot: "100.00" }], holidays: [] };
const base = token(fixture);
assert.equal(base.length, 64, "fixture must prove full SHA-256 hex");
assert.notEqual(base, token({ ...fixture, sales: [{ ...fixture.sales[0], revision: 2 }] }), "sale mutation must change token representation");
assert.notEqual(base, token({ ...fixture, config: { revision: 2 } }), "config mutation must change token representation");
assert.notEqual(base, token({ ...fixture, assignments: [{ ...fixture.assignments[0], revision: 2 }] }), "assignment mutation must change token representation");
assert.notEqual(base, token({ ...fixture, as_of: "2026-08-14" }), "business-day rollover must change token representation");

assert.match(migration, /pg_advisory_xact_lock_shared\(pg_catalog\.hashtextextended\(v_tenant::text\|\|':sales-period-close'/);
for (const table of ["sales", "sales_config", "sales_goal_assignments", "sales_holidays", "sales_celebrations"]) assert.match(migration, new RegExp(`CREATE TRIGGER sales_close_guard_\\w+ BEFORE INSERT OR UPDATE OR DELETE ON public\\.${table}`));
assert.doesNotMatch(migration, /CREATE TRIGGER sales_close_guard_periods/);
assert.match(migration, /TG_TABLE_NAME IN\('sales','sales_goal_assignments','sales_celebrations'\)/);
assert.match(migration, /sp\.status='OPEN'/);
const holidayGuard = migration.slice(migration.indexOf("IF TG_TABLE_NAME='sales_holidays'"), migration.indexOf("RETURN CASE WHEN TG_OP='DELETE'"));
assert.match(holidayGuard, /TG_OP='UPDATE' AND OLD\.tenant_id IS DISTINCT FROM NEW\.tenant_id/);
assert.match(holidayGuard, /LEAST\(OLD\.tenant_id,NEW\.tenant_id\)[\s\S]*GREATEST\(OLD\.tenant_id,NEW\.tenant_id\)/);
assert.match(holidayGuard, /ELSIF TG_OP='DELETE' THEN\s+v_tenant:=OLD\.tenant_id/);
assert.match(holidayGuard, /ELSE\s+v_tenant:=NEW\.tenant_id/);
assert.match(holidayGuard, /IF TG_OP='INSERT' THEN[\s\S]*sp\.tenant_id=NEW\.tenant_id[\s\S]*NEW\.date BETWEEN sp\.starts_on AND sp\.ends_on/);
assert.match(holidayGuard, /ELSIF TG_OP='UPDATE' THEN[\s\S]*sp\.tenant_id=NEW\.tenant_id[\s\S]*NEW\.date BETWEEN sp\.starts_on AND sp\.ends_on[\s\S]*sp\.tenant_id=OLD\.tenant_id[\s\S]*OLD\.date BETWEEN sp\.starts_on AND sp\.ends_on/);
assert.match(holidayGuard, /ELSIF TG_OP='UPDATE' THEN[\s\S]*END IF;\s+ELSE\s+IF EXISTS\(SELECT 1 FROM public\.sales_periods sp WHERE sp\.tenant_id=OLD\.tenant_id[\s\S]*OLD\.date BETWEEN sp\.starts_on AND sp\.ends_on/);
assert.ok(holidayGuard.indexOf("pg_advisory_xact_lock_shared") < holidayGuard.indexOf("IF TG_OP='INSERT' THEN"), "holiday CLOSED checks must run after the shared close mutex");
assert.match(holidayGuard, /RAISE EXCEPTION 'sales_closed_period_immutable' USING ERRCODE='25006'/);
assert.match(migration, /IF TG_OP='DELETE' THEN RETURN OLD;END IF;\s+RETURN NEW;/);
const periodMutex = migration.indexOf("v_tenant::text||':sales-periods'");
const periodRowLock = migration.indexOf("p_period_id FOR UPDATE", periodMutex);
const closeMutex = migration.indexOf("v_tenant::text||':sales-period-close'", periodRowLock);
const nextPeriodRowLock = migration.indexOf("SELECT sp.id,sp.status INTO v_next,v_next_status", closeMutex);
assert.ok(periodMutex >= 0 && periodRowLock > periodMutex && closeMutex > periodRowLock && nextPeriodRowLock > closeMutex, "period mutex -> current period row -> close mutex -> next period row order prevents assignment-writer deadlock");
for (const materialWait of [/PERFORM 1 FROM public\.sales\b[\s\S]{0,300}FOR UPDATE/, /PERFORM 1 FROM public\.sales_config\b[\s\S]{0,300}FOR UPDATE/, /PERFORM 1 FROM public\.sales_goal_assignments\b[\s\S]{0,300}FOR UPDATE/, /PERFORM 1 FROM public\.sales_holidays\b[\s\S]{0,300}FOR UPDATE/, /PERFORM 1 FROM public\.sales_celebrations\b[\s\S]{0,300}FOR UPDATE/]) assert.doesNotMatch(migration, materialWait, "close must not wait material rows after taking exclusive mutex");

assert.match(migration, /CREATE OR REPLACE FUNCTION public\.sales_close_period_v2\(p_period_id uuid,p_expected_revision text/);
assert.match(migration, /p_expected_revision!~'\^\[0-9a-f\]\{64\}\$'/);
assert.match(migration, /v_actual_revision:=public\.sales_close_preview_revision_v1\(v_tenant,p_period_id\)/);
const retry = migration.indexOf("IF v_old_result IS NOT NULL");
const closure = migration.indexOf("IF v_closure IS NOT NULL");
const stale = migration.indexOf("IF v_actual_revision<>p_expected_revision");
assert.ok(retry >= 0 && closure > retry && stale > closure, "retry and canonical closure recovery must precede stale-preview rejection");

assert.match(migration, /v_next_blocker:=jsonb_build_array\(jsonb_build_object\('code','sales_next_period_not_empty'/);
assert.match(migration, /'can_close',jsonb_array_length\(v_blockers\)=0/);
assert.match(migration, /SELECT sp\.id,sp\.status INTO v_next,v_next_status[\s\S]*FOR UPDATE/);
for (const proof of [/EXISTS\(SELECT 1 FROM public\.sales s[\s\S]*s\.period_id=v_next\)/, /EXISTS\(SELECT 1 FROM public\.sales_period_closures spc[\s\S]*spc\.period_id=v_next OR spc\.next_period_id=v_next/, /EXISTS\(SELECT 1 FROM public\.sales_celebrations sce[\s\S]*sce\.period_id=v_next/]) assert.match(migration, proof);
assert.match(migration, /sales_next_period_not_empty/);
assert.match(migration, /IF v_next IS NULL THEN INSERT INTO public\.sales_periods/);
assert.match(migration, /v_next_progress:=public\.sales_metrics_internal_v1\(v_tenant,v_next,NULL,NULL\)/);
assert.match(migration, /'next_period_progress',v_next_progress/);
assert.doesNotMatch(migration, /'next_period_progress',jsonb_build_object\([^)]*'realized_value',0/);
assert.match(migration, /COALESCE\(\(v_next_progress->>'sales_count'\)::bigint,0\)<>0/);

for (const snapshot of ["sales_by_status", "config", "assignments", "metrics", "schema_version"]) assert.match(migration, new RegExp(`'${snapshot}'`));
for (const outcome of ["replayed", "converged", "created"]) assert.match(migration, new RegExp(`'outcome','${outcome}'`));
assert.match(migration, /sales_idempotency_mismatch/);
assert.match(migration, /sales_overlapping_period/);
assert.match(migration, /PERIOD_CLOSED_V2/);
assert.doesNotMatch(migration, /\b(?:DELETE\s+FROM|TRUNCATE\s+(?:TABLE\s+)?)public\.sales_/i);
assert.doesNotMatch(migration, /UPDATE public\.sales\s+SET[\s\S]*=0/i);
assert.ok(/^BEGIN;/m.test(migration) && /COMMIT;\s*$/.test(migration), "new/existing conflict must roll back the whole transaction");

assert.match(rollback, /DROP FUNCTION IF EXISTS public\.sales_close_period_v2\(uuid,text,date,date,text\)/);
assert.match(rollback, /DROP FUNCTION IF EXISTS public\.sales_close_preview_revision_v1\(uuid,uuid\)/);
for (const table of ["sales_celebrations", "sales_holidays", "sales_goal_assignments", "sales_config", "sales"]) assert.match(rollback, new RegExp(`DROP TRIGGER IF EXISTS sales_close_guard_\\w+ ON public\\.${table}`));
assert.match(rollback, /DROP FUNCTION IF EXISTS public\.sales_close_material_write_guard_v1\(\)/);
assert.match(rollback, /DROP TABLE IF EXISTS public\.sales_period_close_requests/);
assert.match(rollback, /RENAME TO sales_close_period_v1/);

console.log("sales period close v2 structural tests: PASS (structural only; no PostgreSQL runtime asserted)");

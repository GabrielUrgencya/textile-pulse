import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(resolve("prisma/migrations/20260813150000_sales_consultant_journey/migration.sql"), "utf8");
const rollback = readFileSync(resolve("prisma/migrations/20260813150000_sales_consultant_journey/rollback.sql"), "utf8");
const functions = [
  "sales_consultant_upsert_sale_v1",
  "sales_consultant_list_sales_v1",
  "sales_consultant_sale_detail_v1",
  "sales_consultant_dashboard_v1",
  "sales_consultant_claim_celebration_v1",
];

for (const fn of functions) {
  assert.match(migration, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\b`));
  assert.match(migration, new RegExp(`FUNCTION public\\.${fn}[\\s\\S]{0,600}SECURITY DEFINER`));
}
assert.equal((migration.match(/public\.auth_tenant_id\(\)/g) ?? []).length, 5, "every public consultant contract must derive tenant from session");
assert.equal((migration.match(/auth\.uid\(\)/g) ?? []).length, 5, "every public consultant contract must derive actor from session");
assert.equal((migration.match(/sales_membership_role\(\) IS DISTINCT FROM 'CONSULTANT'/g) ?? []).length, 5, "ADMIN and inactive users must not enter the consultant journey");
assert.doesNotMatch(migration, /p_tenant_id|p_actor_id|p_consultant_profile_id/);

const upsert = migration.slice(migration.indexOf("sales_consultant_upsert_sale_v1"), migration.indexOf("sales_consultant_list_sales_v1"));
assert.match(upsert, /p_expected_revision bigint,p_idempotency_key text/);
assert.match(upsert, /jsonb_build_object\('actor_id',v_actor/);
assert.match(upsert, /pg_advisory_xact_lock\(pg_catalog\.hashtextextended\(v_tenant::text\|\|':sales:'\|\|v_key/);
const replay = upsert.indexOf("IF v_result IS NOT NULL");
const periodLookup = upsert.indexOf("SELECT sp.id INTO v_period");
assert.ok(replay >= 0 && periodLookup > replay, "idempotent replay must resolve before mutable-state checks");
assert.match(upsert, /sales_idempotency_mismatch/);
assert.match(upsert, /'outcome','replayed'/);
assert.match(upsert, /sp\.status='OPEN'[\s\S]*FOR UPDATE OF sp/);
assert.match(upsert, /p_status NOT IN\('OPEN','CLOSED'\)/);
assert.match(upsert, /p_payment_method_id IS NULL/);
assert.doesNotMatch(upsert, /DELETE FROM public\.sales|status='CANCELLED'|sales_cancel/i);
assert.match(upsert, /p_expected_revision<>0[\s\S]*sales_stale_revision/);
assert.match(upsert, /\(v_before->>'revision'\)::bigint<>p_expected_revision/);
assert.match(upsert, /s\.consultant_profile_id=v_actor/);
assert.match(upsert, /consultant_profile_id=v_actor RETURNING/);
assert.match(upsert, /pm\.is_active/);
assert.match(upsert, /p_sets_count\*v_pieces_per_set\+p_loose_pieces_count/);
for (const field of ["pv_number", "sale_value", "freight_value", "discount_value", "payment_method_id", "installments", "sets_count", "loose_pieces_count", "pieces_total", "invoice_number", "status", "sold_at", "revision"]) assert.ok(upsert.includes(field), `${field} must be persisted/returned by consultant upsert`);
assert.match(upsert, /INSERT INTO public\.sales_mutation_requests[\s\S]*'UPSERT'/);
assert.match(upsert, /sales_audit_events[\s\S]*'source','CONSULTANT'/);
assert.match(upsert, /'outcome',CASE WHEN p_sale_id IS NULL THEN'created'ELSE'updated'END/);

const list = migration.slice(migration.indexOf("sales_consultant_list_sales_v1"), migration.indexOf("sales_consultant_sale_detail_v1"));
const detail = migration.slice(migration.indexOf("sales_consultant_sale_detail_v1"), migration.indexOf("sales_consultant_dashboard_v1"));
for (const ownRead of [list, detail]) {
  assert.match(ownRead, /s\.tenant_id=v_tenant/);
  assert.match(ownRead, /s\.consultant_profile_id=v_actor/);
  assert.match(ownRead, /s\.status IN\('OPEN','CLOSED'\)/);
  assert.doesNotMatch(ownRead, /full_name|consultant_name|p_consultant/);
}
assert.match(list, /p_month integer DEFAULT NULL,p_year integer DEFAULT NULL/);
assert.match(list, /p_status='CANCELLED'/);
assert.match(list, /jsonb_build_object\('items',v_items,'page',p_page,'page_size',p_page_size,'total',v_total/);
assert.match(detail, /sales_not_found_or_out_of_scope/);
assert.doesNotMatch(detail, /sales_cross_consultant|another|exists/i);

const dashboard = migration.slice(migration.indexOf("sales_consultant_dashboard_v1"), migration.indexOf("sales_consultant_claim_celebration_v1"));
assert.match(dashboard, /sales_metrics_internal_v1\(v_tenant,v_period,v_actor,v_as_of\)/);
assert.match(dashboard, /s\.status='OPEN'/);
assert.match(dashboard, /\(v_metrics->>'sales_count'\)::numeric=0 THEN 0/);
assert.match(dashboard, /\(v_metrics->>'pieces_total'\)::numeric=0 THEN 0/);
assert.match(dashboard, /v_average_per_business_day:=CASE WHEN COALESCE\(\(v_metrics->>'business_days_elapsed'\)::numeric,0\)=0 THEN 0 ELSE round\(\(v_metrics->>'realized_value'\)::numeric\/\(v_metrics->>'business_days_elapsed'\)::numeric,2\)END/);
assert.match(dashboard, /'average_per_business_day',v_average_per_business_day/);
const periodsQuery = dashboard.match(/SELECT COALESCE\(jsonb_agg\(jsonb_build_object\('id',sp\.id,'starts_on',sp\.starts_on,'ends_on',sp\.ends_on,'status',sp\.status\)ORDER BY sp\.starts_on DESC,sp\.ends_on DESC,sp\.id\),'\[\]'::jsonb\)INTO v_available_periods FROM public\.sales_periods sp WHERE sp\.tenant_id=v_tenant;/)?.[0] ?? "";
assert.ok(periodsQuery, "dashboard must expose every tenant period independently of filters and pagination");
assert.doesNotMatch(periodsQuery, /JOIN|public\.sales\b|consultant|profile|sale_value|realized|members/);
assert.match(dashboard, /'available_periods',v_available_periods/);
assert.match(dashboard, /'tickets',jsonb_build_object\('sale',v_ticket_sale,'piece',v_ticket_piece\)/);
assert.match(dashboard, /'comparison',jsonb_build_object\('current_month',v_current_month,'previous_month',v_previous_month/);
assert.match(dashboard, /'accumulated',jsonb_build_object\('year'/);
assert.match(dashboard, /s\.consultant_profile_id=v_actor AND s\.status='CLOSED'/);
assert.match(dashboard, /COALESCE\(sc\.timezone,'America\/Sao_Paulo'\),COALESCE\(sc\.allow_team_aggregates,false\)/);
assert.match(dashboard, /v_quarter:=\(\(extract\(month FROM v_month_start\)::integer-1\)\/3\)\+1/);
assert.match(dashboard, /v_quarter_start:=make_date\(extract\(year FROM v_month_start\)::integer,\(v_quarter-1\)\*3\+1,1\)/);
assert.match(dashboard, /v_quarter_end:=\(v_quarter_start\+interval'3 months'-interval'1 day'\)::date/);
assert.match(dashboard, /s\.consultant_profile_id=v_actor AND s\.status='CLOSED' AND\(s\.sold_at AT TIME ZONE v_timezone\)::date BETWEEN v_quarter_start AND v_quarter_end/);
assert.match(dashboard, /sga\.goal_scope_snapshot='QUARTERLY'/);
assert.match(dashboard, /sga\.valid_from_snapshot IS NULL OR sga\.valid_from_snapshot<=v_quarter_end/);
assert.match(dashboard, /sga\.valid_until_snapshot IS NULL OR sga\.valid_until_snapshot>=v_quarter_start/);
assert.match(dashboard, /'quarterly',jsonb_build_object\('quarter',v_quarter,'year'[\s\S]*'realized_value',v_quarter_realized,'target_value',v_quarter_target,'progress_percent',CASE WHEN v_quarter_target=0 THEN 0/);
const collectiveGuard = dashboard.indexOf("IF NOT v_allow_team_aggregates THEN");
const collectiveTeamQuery = dashboard.indexOf("SELECT jsonb_build_object('allowed',true", collectiveGuard);
assert.ok(collectiveGuard >= 0 && collectiveTeamQuery > collectiveGuard, "allow_team_aggregates=false branch must precede every team aggregation query");
assert.match(dashboard, /IF NOT v_allow_team_aggregates THEN\s+v_collective:=jsonb_build_object\('allowed',false\);/);
assert.match(dashboard, /jsonb_build_object\('allowed',true,'target_value'[\s\S]*CASE WHEN q\.target_value=0 THEN 0/);
assert.match(dashboard, /'collective',v_collective/);
assert.doesNotMatch(dashboard, /full_name|ranking|'members'|display_name/);

const celebration = migration.slice(migration.indexOf("sales_consultant_claim_celebration_v1"), migration.indexOf("REVOKE EXECUTE ON FUNCTION public.sales_upsert_sale_v1"));
assert.match(celebration, /sales_consultant_claim_celebration_v1\(p_period_id uuid\)/);
assert.doesNotMatch(celebration, /p_goal_id|p_profile_id|p_audience/);
assert.match(celebration, /sga\.profile_id=v_actor/);
assert.match(celebration, /sga\.is_active AND sga\.goal_scope_snapshot='INDIVIDUAL'/);
assert.match(celebration, /sga\.target_value_snapshot>0 AND sga\.target_value_snapshot<=v_realized/);
assert.match(celebration, /sga\.valid_from_snapshot IS NULL OR sga\.valid_from_snapshot<=sp\.ends_on/);
assert.match(celebration, /sga\.valid_until_snapshot IS NULL OR sga\.valid_until_snapshot>=sp\.starts_on/);
assert.match(celebration, /s\.consultant_profile_id=v_actor AND s\.status='CLOSED'/);
assert.match(celebration, /NOT EXISTS\(SELECT 1 FROM public\.sales_celebrations sce[\s\S]*sce\.audience='PRIVATE'\)/);
assert.match(celebration, /ORDER BY sga\.target_value_snapshot ASC,sga\.goal_sort_order_snapshot ASC,sga\.goal_id ASC LIMIT 1/);
assert.match(celebration, /VALUES\(v_tenant,p_period_id,v_goal_id,v_actor,'PRIVATE'\)ON CONFLICT DO NOTHING/);
assert.match(celebration, /GET DIAGNOSTICS v_inserted=ROW_COUNT/);
assert.match(celebration, /'threshold_value',v_target,'commission_percent',v_commission/);
assert.match(celebration, /'status','no_eligible_milestone'/);

assert.match(migration, /REVOKE EXECUTE ON FUNCTION public\.sales_upsert_sale_v1[\s\S]*sales_claim_celebration_v1[\s\S]*FROM authenticated/);
assert.match(migration, /REVOKE ALL ON FUNCTION public\.sales_consultant_upsert_sale_v1[\s\S]*FROM PUBLIC,anon/);
assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.sales_consultant_upsert_sale_v1[\s\S]*TO authenticated/);
assert.ok(/^BEGIN;/m.test(migration) && /COMMIT;\s*$/.test(migration), "migration must be atomic");

for (const fn of functions.toReversed()) assert.match(rollback, new RegExp(`DROP FUNCTION IF EXISTS public\\.${fn}\\b`));
assert.match(rollback, /DROP FUNCTION IF EXISTS public\.sales_consultant_claim_celebration_v1\(uuid\)/);
assert.match(rollback, /GRANT EXECUTE ON FUNCTION public\.sales_upsert_sale_v1[\s\S]*sales_claim_celebration_v1[\s\S]*TO authenticated/);
assert.ok(/^BEGIN;/m.test(rollback) && /COMMIT;\s*$/.test(rollback), "rollback must be atomic");

console.log("sales consultant journey structural contracts: PASS (structural only; no PostgreSQL runtime asserted)");

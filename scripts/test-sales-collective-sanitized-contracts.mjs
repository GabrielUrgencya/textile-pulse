import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(
    "prisma/migrations/20260813170000_sales_collective_sanitized/migration.sql",
  ),
  "utf8",
);
const rollback = readFileSync(
  resolve(
    "prisma/migrations/20260813170000_sales_collective_sanitized/rollback.sql",
  ),
  "utf8",
);
const goalsMigration = readFileSync(
  resolve(
    "prisma/migrations/20260812130000_sales_admin_configuration_goals/migration.sql",
  ),
  "utf8",
);
const goalIdentityMigration = readFileSync(
  resolve(
    "prisma/migrations/20260808190000_sales_goal_provisioning_key/migration.sql",
  ),
  "utf8",
);
const foundationMigration = readFileSync(
  resolve(
    "prisma/migrations/20260808150000_lision_sales_foundation/migration.sql",
  ),
  "utf8",
);

assert.match(
  migration,
  /to_regprocedure\('extensions\.digest\(bytea,text\)'\)[\s\S]*sales_collective_requires_extensions_digest_sha256/,
);
assert.match(
  migration,
  /CREATE OR REPLACE FUNCTION public\.sales_collective_summary_v2\(p_period_key text DEFAULT NULL,p_month integer DEFAULT NULL,p_year integer DEFAULT NULL,p_page integer DEFAULT 1,p_page_size integer DEFAULT 25\)/,
);
assert.match(
  migration,
  /STABLE SECURITY DEFINER SET search_path=pg_catalog,public,extensions/,
);
assert.match(
  migration,
  /v_tenant uuid:=public\.auth_tenant_id\(\);v_actor uuid:=auth\.uid\(\);v_role public\."SalesMemberRole":=public\.sales_membership_role\(\)/,
);
assert.match(
  migration,
  /v_role IS NULL OR v_role NOT IN\('ADMIN','CONSULTANT'\)/,
);
const publicSignature =
  migration.match(/sales_collective_summary_v2\(([^)]*)\)/)?.[1] ?? "";
assert.doesNotMatch(publicSignature, /tenant|profile|actor|role|period_id/);

assert.match(migration, /p_period_key!~'\^\[0-9a-f\]\{64\}\$'/);
assert.match(migration, /p_month NOT BETWEEN 1 AND 12/);
assert.match(migration, /p_year NOT BETWEEN 2000 AND 2200/);
assert.match(migration, /p_month IS NOT NULL AND p_year IS NULL/);
assert.match(migration, /p_page IS NULL OR p_page<1/);
assert.match(
  migration,
  /p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100/,
);

const allow = migration.indexOf("IF NOT v_allowed THEN RETURN");
const sales = migration.indexOf("FROM public.sales s", allow);
const members = migration.indexOf("FROM public.sales_memberships sm", allow);
assert.ok(
  allow >= 0 && sales > allow && members > allow,
  "allow=false must return before every team/member query",
);
assert.match(
  migration,
  /IF NOT v_allowed THEN RETURN jsonb_build_object\('allowed',false/,
);
assert.match(
  migration,
  /RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER/,
);

assert.match(
  migration,
  /FROM public\.sales_periods sp WHERE sp\.tenant_id=v_tenant/,
);
assert.match(
  migration,
  /public\.sales_collective_period_key_v1\(v_tenant,sp\.id\)=p_period_key/,
);
assert.doesNotMatch(migration, /sp\.id=p_period_key/);
assert.match(migration, /'available_periods',v_available_periods/);
assert.match(migration, /ORDER BY sp\.starts_on DESC,sp\.ends_on DESC/);
assert.match(migration, /COALESCE\(sc\.timezone,'America\/Sao_Paulo'\)/);
assert.match(migration, /v_as_of:=\(now\(\)AT TIME ZONE v_timezone\)::date/);
assert.match(migration, /make_date\(p_year,p_month,1\)/);
assert.match(
  migration,
  /sp\.starts_on<=v_filter_end AND sp\.ends_on>=v_filter_start/,
);

assert.match(
  migration,
  /sales_metrics_internal_v1\(v_tenant,v_period,NULL,v_as_of\)/,
);
assert.match(migration, /s\.status='CLOSED'/);
assert.doesNotMatch(migration, /s\.status='OPEN'[\s\S]*INTO v_sales_count/);
for (const key of [
  "'achieved_percent'",
  "'ideal_pace_percent'",
  "'necessary_per_business_day_percent'",
  "'business_days_remaining'",
  "'sales_count'",
  "'pieces_total'",
  "'freight_share_percent'",
])
  assert.ok(migration.includes(key), `${key} missing from sanitized DTO`);
assert.match(migration, /CASE WHEN v_remaining=0 THEN 0/);
assert.match(migration, /CASE WHEN v_gross=0 THEN 0/);
assert.match(migration, /CASE WHEN sga\.target_value_snapshot=0 THEN 0/);

for (const identity of [
  "META_1",
  "META_2",
  "META_3",
  "CHALLENGE",
  "QUARTERLY",
  "COLLECTIVE",
])
  assert.match(migration, new RegExp(`'${identity}'`));
assert.match(
  migration,
  /JOIN public\.sales_goals sg ON sg\.tenant_id=sga\.tenant_id AND sg\.id=sga\.goal_id/,
);
assert.match(
  migration,
  /sga\.profile_id IS NOT NULL[\s\S]*sg\.provisioning_key IN\('META_1','META_2','META_3','CHALLENGE'\)AND sga\.goal_scope_snapshot='INDIVIDUAL'/,
);
assert.match(
  migration,
  /sg\.provisioning_key IN\([^)]*'CHALLENGE'[^)]*\)AND sga\.goal_scope_snapshot='INDIVIDUAL'/,
);
assert.match(
  migration,
  /sg\.provisioning_key='QUARTERLY' AND sga\.goal_scope_snapshot='QUARTERLY'/,
);
assert.doesNotMatch(
  migration,
  /goal_scope_snapshot='INDIVIDUAL' AND sg\.provisioning_key IN\('META_1','META_2','META_3','CHALLENGE','QUARTERLY'\)/,
);
assert.match(
  migration,
  /LEFT JOIN public\.sales s[\s\S]*s\.consultant_profile_id=sga\.profile_id AND s\.status='CLOSED'/,
);
assert.match(
  migration,
  /count\(\*\)participant_count,round\(avg\(progress_percent\),2\)progress_percent/,
);
assert.match(migration, /COALESCE\(st\.participant_count,0\)>=3/);
assert.match(migration, /'minimum_participants',3/);
assert.match(migration, /sg\.provisioning_key='COLLECTIVE'/);
assert.match(
  migration,
  /sga\.profile_id IS NULL[\s\S]*sga\.goal_scope_snapshot='COLLECTIVE'/,
);
assert.match(
  goalsMigration,
  /provisioning_key=COALESCE\(provisioning_key,p_provisioning_key\)/,
);
assert.match(
  goalIdentityMigration,
  /UNIQUE INDEX sales_goals_tenant_provisioning_key_key[\s\S]*\(tenant_id, provisioning_key\)[\s\S]*WHERE provisioning_key IS NOT NULL/,
);
assert.match(
  goalIdentityMigration,
  /sales_goal_provisioning_key_immutable[\s\S]*NEW\.provisioning_key IS DISTINCT FROM OLD\.provisioning_key/,
);
assert.match(
  foundationMigration,
  /UNIQUE INDEX sales_goal_assignments_unique[\s\S]*tenant_id, goal_id, period_id, COALESCE\(profile_id/,
);
assert.match(migration, /'CHALLENGE','Desafio'/);
assert.match(migration, /'label','Meta coletiva'/);
assert.ok(
  (
    migration.match(
      /valid_from_snapshot IS NULL OR sga\.valid_from_snapshot<=v_end/g,
    ) ?? []
  ).length >= 2,
);
assert.ok(
  (
    migration.match(
      /valid_until_snapshot IS NULL OR sga\.valid_until_snapshot>=v_start/g,
    ) ?? []
  ).length >= 2,
);

assert.match(migration, /dense_rank\(\)OVER\(ORDER BY q\.realized DESC\)/);
assert.match(migration, /count\(\*\)OVER\(PARTITION BY q\.realized\)tie_count/);
assert.match(migration, /'label','Posi[^']*o '\|\|x\.position/);
assert.match(migration, /v_member_count>=3/);
assert.match(migration, /'minimum_team_size',3,'suppressed',v_member_count<3/);
assert.match(
  migration,
  /ORDER BY ranked\.position,ranked\.stable_order LIMIT p_page_size OFFSET\(p_page-1\)\*p_page_size/,
);
assert.match(
  migration,
  /'page',p_page,'page_size',p_page_size,'total',v_rank_total/,
);

assert.ok((migration.match(/sales_count<3/g) ?? []).length >= 2);
assert.ok((migration.match(/sales_count>=3/g) ?? []).length >= 2);
assert.ok(
  (migration.match(/hidden_count IN\(1,2\)AND r\.complement_order=1/g) ?? [])
    .length >= 2,
);
assert.ok(
  (migration.match(/row_number\(\)OVER\(ORDER BY b\.sales_count/g) ?? [])
    .length >= 2,
);
assert.ok(
  (migration.match(/'minimum_bucket_size',3,'has_suppressed_buckets'/g) ?? [])
    .length >= 2,
);
assert.match(migration, /'label',x\.bucket::text\|\|'x'/);
assert.match(
  migration,
  /pm\.name method_name[\s\S]*JOIN public\.sales_payment_methods pm/,
);
assert.match(migration, /'label',x\.method_name/);

function complementaryVisible(counts) {
  const hidden = counts.filter((c) => c < 3).reduce((a, b) => a + b, 0);
  const eligible = counts.filter((c) => c >= 3).sort((a, b) => a - b);
  if ((hidden === 1 || hidden === 2) && eligible.length) eligible.shift();
  return eligible;
}
for (const counts of [
  [9, 1],
  [8, 2],
  [7, 3],
  [5, 4, 1],
  [6, 3, 1],
  [4, 3, 2],
]) {
  const visible = complementaryVisible(counts);
  const residual =
    counts.reduce((a, b) => a + b, 0) - visible.reduce((a, b) => a + b, 0);
  assert.ok(
    residual === 0 || residual >= 3,
    `inferable residual ${residual} for ${counts}`,
  );
}
assert.deepEqual(complementaryVisible([9, 1]), []);
assert.deepEqual(complementaryVisible([8, 2]), []);
assert.deepEqual(complementaryVisible([7, 3]), [3, 7]);

const responseStart = migration.indexOf(
  "RETURN jsonb_build_object('allowed',true",
);
const response = migration.slice(
  responseStart,
  migration.indexOf("END;$$", responseStart),
);
assert.doesNotMatch(
  response,
  /suppressed_sales_count|hidden_count|complement_order/,
);
for (const forbidden of [
  "'profile_id'",
  "'user_id'",
  "'display_name'",
  "'avatar'",
  "'sale_value'",
  "'realized_value'",
  "'commission'",
  "'ticket'",
  "'freight_total'",
  "'payment_method_id'",
  "'goal_id'",
  "'stable_order'",
  "'participant_count'",
])
  assert.doesNotMatch(
    response,
    new RegExp(forbidden),
    `${forbidden} must not be a response key`,
  );
assert.doesNotMatch(response, /full_name|members|ranking_value|individual/);

assert.match(
  migration,
  /REVOKE EXECUTE ON FUNCTION public\.sales_collective_summary_v1\(uuid\) FROM PUBLIC,anon,authenticated/,
);
assert.match(
  migration,
  /REVOKE ALL ON FUNCTION public\.sales_collective_summary_v2\(text,integer,integer,integer,integer\) FROM PUBLIC,anon/,
);
assert.match(
  migration,
  /GRANT EXECUTE ON FUNCTION public\.sales_collective_summary_v2\(text,integer,integer,integer,integer\) TO authenticated/,
);
assert.match(
  rollback,
  /DROP FUNCTION IF EXISTS public\.sales_collective_summary_v2\(text,integer,integer,integer,integer\)/,
);
assert.match(
  rollback,
  /DROP FUNCTION IF EXISTS public\.sales_collective_period_key_v1\(uuid,uuid\)/,
);
assert.match(
  rollback,
  /GRANT EXECUTE ON FUNCTION public\.sales_collective_summary_v1\(uuid\) TO authenticated/,
);
const sourceFiles = readdirSync(resolve("src"), {
  recursive: true,
  withFileTypes: true,
})
  .filter((entry) => entry.isFile())
  .map((entry) => readFileSync(resolve(entry.parentPath, entry.name), "utf8"))
  .join("\n");
assert.doesNotMatch(sourceFiles, /sales_collective_summary_v1/);
assert.doesNotMatch(sourceFiles, /sales_tv_snapshot_v1/);
assert.match(sourceFiles, /sales_tv_kiosk_snapshot_v2/);
assert.ok(/^BEGIN;/m.test(migration) && /COMMIT;\s*$/.test(migration));
assert.ok(/^BEGIN;/m.test(rollback) && /COMMIT;\s*$/.test(rollback));

console.log(
  "sales collective sanitized structural contracts: PASS (structural only; no PostgreSQL runtime asserted)",
);

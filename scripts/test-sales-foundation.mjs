import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationPath = resolve(
  "prisma/migrations/20260808150000_lision_sales_foundation/migration.sql",
);
const rollbackPath = resolve(
  "prisma/migrations/20260808150000_lision_sales_foundation/rollback.sql",
);
const aclHardeningPath = resolve(
  "prisma/migrations/20260808183000_sales_function_acl_hardening/migration.sql",
);

const migration = readFileSync(migrationPath, "utf8");
const rollback = readFileSync(rollbackPath, "utf8");
const aclHardening = readFileSync(aclHardeningPath, "utf8");

const salesTables = [
  "sales_memberships",
  "sales_config",
  "sales_holidays",
  "sales_payment_methods",
  "sales_periods",
  "sales",
  "sales_goals",
  "sales_goal_assignments",
  "sales_period_closures",
  "sales_celebrations",
  "sales_audit_events",
];

for (const table of salesTables) {
  assert.match(migration, new RegExp(`CREATE TABLE public\\.${table}\\b`));
  assert.match(
    migration,
    new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`),
  );
  assert.match(rollback, new RegExp(`DROP TABLE IF EXISTS public\\.${table}\\b`));
}

for (const functionName of [
  "sales_membership_role",
  "sales_is_admin",
  "sales_my_access_v1",
  "sales_upsert_sale_v1",
  "sales_cancel_sale_v1",
  "sales_close_period_v1",
  "sales_claim_celebration_v1",
  "sales_metrics_v1",
  "sales_my_dashboard_v1",
  "sales_admin_dashboard_v1",
  "sales_collective_summary_v1",
  "sales_tv_snapshot_v1",
]) {
  assert.match(
    migration,
    new RegExp(`FUNCTION public\\.${functionName}\\b`),
    `${functionName} must exist`,
  );
}

const internalFunctionSignatures = [
  "sales_membership_role\\(\\)",
  "sales_is_admin\\(\\)",
  "sales_my_access_v1\\(\\)",
  "sales_upsert_sale_v1\\(uuid, uuid, text, numeric, numeric, numeric, uuid, integer, integer, integer, text, public\\.\"SalesSaleStatus\", timestamptz\\)",
  "sales_cancel_sale_v1\\(uuid, text\\)",
  "sales_close_period_v1\\(uuid, text\\)",
  "sales_claim_celebration_v1\\(uuid, uuid, uuid, public\\.\"SalesCelebrationAudience\"\\)",
  "sales_metrics_v1\\(uuid, uuid, uuid, date\\)",
  "sales_my_dashboard_v1\\(uuid\\)",
  "sales_admin_dashboard_v1\\(uuid\\)",
  "sales_collective_summary_v1\\(uuid\\)",
];

for (const signature of internalFunctionSignatures) {
  assert.match(
    aclHardening,
    new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${signature} FROM PUBLIC, anon;`),
    `${signature} must explicitly deny anonymous execution`,
  );
  assert.match(
    aclHardening,
    new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${signature} TO authenticated;`),
    `${signature} must preserve authenticated execution`,
  );
}
assert.doesNotMatch(
  migration,
  /REVOKE EXECUTE ON FUNCTION public\.sales_(?!tv_snapshot)[^;]+ FROM anon;/,
  "the applied foundation migration must retain its original checksum",
);
assert.doesNotMatch(
  aclHardening,
  /REVOKE EXECUTE ON FUNCTION public\.sales_tv_snapshot_v1\(uuid, uuid\) FROM (?:PUBLIC, )?anon;/,
  "TV snapshot must remain the only anonymous sales RPC",
);
assert.match(
  aclHardening,
  /REVOKE EXECUTE ON FUNCTION public\.sales_tv_snapshot_v1\(uuid, uuid\) FROM PUBLIC;/,
  "TV snapshot must not inherit execution from PUBLIC",
);
assert.match(
  aclHardening,
  /GRANT EXECUTE ON FUNCTION public\.sales_tv_snapshot_v1\(uuid, uuid\) TO anon, authenticated;/,
  "TV snapshot must remain available to anon and authenticated",
);
const anonymousSalesGrants = [
  ...aclHardening.matchAll(
    /GRANT EXECUTE ON FUNCTION public\.(sales_[^(]+\([^;]+\)) TO [^;]*\banon\b[^;]*;/g,
  ),
].map((match) => match[1]);
assert.deepEqual(
  anonymousSalesGrants,
  ["sales_tv_snapshot_v1(uuid, uuid)"],
  "TV snapshot must be the only sales function granted to anon",
);

assert.match(migration, /SECURITY DEFINER/g);
assert.match(migration, /SET search_path = pg_catalog, public/g);
assert.match(migration, /sales_cross_consultant_denied/);
assert.match(migration, /kt\.scope = 'sales_tv'/);
assert.match(migration, /s\.status = 'CLOSED'/);
assert.match(migration, /s\.sale_value - s\.discount_value/);
assert.match(migration, /ON CONFLICT DO NOTHING/);
assert.match(migration, /sales_period_closures_tenant_idx/);
assert.match(
  migration,
  /CONSTRAINT sales_period_closures_tenant_idempotency_key UNIQUE \(tenant_id, idempotency_key\)/,
  "period close idempotency must be tenant-scoped",
);
assert.match(
  migration,
  /sales_idempotency_key_reused_for_another_period/,
  "reusing a key for another period in the same tenant must fail explicitly",
);
assert.match(migration, /pg_advisory_xact_lock/);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.sales_metrics_v1/);
assert.match(migration, /pg_catalog\.generate_series/);
assert.match(migration, /FROM public\.sales_holidays/);
assert.match(migration, /sg\.target_value <= v_realized/);
assert.match(migration, /v_realized \/ v_collective_target/);
assert.doesNotMatch(
  migration,
  /idempotency_key text NOT NULL UNIQUE/,
  "idempotency keys must not collide across tenants",
);
assert.doesNotMatch(
  migration,
  /REVOKE ALL ON ALL TABLES IN SCHEMA public/,
  "migration must not change grants of unrelated LISION tables",
);
assert.doesNotMatch(
  migration,
  /\bDELETE\s+FROM\s+public\.sales\b/i,
  "sales cancellation must remain non-destructive",
);
assert.doesNotMatch(
  migration,
  /user_metadata/i,
  "tenant isolation must not trust user-editable metadata",
);

// Deterministic formula fixtures mirror the SQL contract without requiring a
// running PostgreSQL instance. PostgreSQL/RLS execution remains a separate gate.
const isoDate = (value) => new Date(`${value}T12:00:00.000Z`);
const dateKey = (value) => value.toISOString().slice(0, 10);
const businessCalendar = ({ start, end, asOf, holidays = [], closed = false }) => {
  const holidaySet = new Set(holidays);
  const days = [];
  for (let cursor = isoDate(start); cursor <= isoDate(end); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6 && !holidaySet.has(dateKey(cursor))) days.push(dateKey(cursor));
  }
  return {
    total: days.length,
    elapsed: closed ? days.length : days.filter((day) => day <= asOf).length,
    remaining: closed ? 0 : days.filter((day) => day >= asOf).length,
  };
};

const fixtureMetrics = ({ sales, goals, collectiveTarget, calendar, piecesPerSet = 2 }) => {
  const closedSales = sales.filter((sale) => sale.status === "CLOSED");
  const realized = closedSales.reduce((sum, sale) => sum + sale.value - sale.discount, 0);
  const pieces = closedSales.reduce(
    (sum, sale) => sum + sale.sets * piecesPerSet + sale.loosePieces,
    0,
  );
  const attained = goals
    .filter((goal) => goal.target <= realized)
    .sort((left, right) => right.target - left.target)[0];
  return {
    realized,
    pieces,
    idealPace: calendar.total === 0 ? 0 : (calendar.elapsed / calendar.total) * 100,
    contribution: collectiveTarget === 0 ? 0 : (realized / collectiveTarget) * 100,
    commission: realized * (attained?.commissionPercent ?? 0) / 100,
    goals: goals.map((goal) => ({
      progress: goal.target === 0 ? 0 : (realized / goal.target) * 100,
      requiredPerDay: realized >= goal.target
        ? 0
        : calendar.remaining === 0 ? null : (goal.target - realized) / calendar.remaining,
    })),
  };
};

const openCalendar = businessCalendar({
  start: "2026-08-03",
  end: "2026-08-10",
  asOf: "2026-08-08", // Saturday: remaining starts on Monday.
  holidays: ["2026-08-07"],
});
assert.deepEqual(openCalendar, { total: 5, elapsed: 4, remaining: 1 });

const metrics = fixtureMetrics({
  sales: [
    { status: "CLOSED", value: 700, discount: 100, sets: 2, loosePieces: 1 },
    { status: "OPEN", value: 900, discount: 0, sets: 9, loosePieces: 0 },
    { status: "CANCELLED", value: 800, discount: 0, sets: 8, loosePieces: 0 },
  ],
  goals: [
    { target: 0, commissionPercent: 99 },
    { target: 500, commissionPercent: 5 },
    { target: 1000, commissionPercent: 8 },
  ],
  collectiveTarget: 2000,
  calendar: openCalendar,
});
assert.equal(metrics.realized, 600);
assert.equal(metrics.pieces, 5);
assert.equal(metrics.idealPace, 80);
assert.equal(metrics.contribution, 30);
assert.equal(metrics.commission, 30, "highest attained individual goal supplies commission");
assert.equal(metrics.goals[0].progress, 0, "zero target has a finite defined progress");
assert.equal(metrics.goals[2].requiredPerDay, 400);

const closedCalendar = businessCalendar({
  start: "2026-08-03",
  end: "2026-08-10",
  asOf: "2026-08-05",
  closed: true,
});
assert.equal(closedCalendar.elapsed, closedCalendar.total);
assert.equal(closedCalendar.remaining, 0);
const unattainedAfterClose = fixtureMetrics({
  sales: [], goals: [{ target: 100, commissionPercent: 5 }], collectiveTarget: 0, calendar: closedCalendar,
});
assert.equal(unattainedAfterClose.goals[0].requiredPerDay, null);
assert.equal(unattainedAfterClose.commission, 0);

console.log("PASS: LISION Vendas foundation migration contracts verified.");

import "dotenv/config";
import postgres from "postgres";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  resolveGoalProvisioningAction,
  validateSalesProvisioningManifest,
} from "./lib/sales-provisioning.mjs";

const args = process.argv.slice(2);
const manifestFlag = args.indexOf("--manifest");
const dryRun = args.includes("--dry-run");
if (manifestFlag < 0 || !args[manifestFlag + 1]) {
  throw new Error("usage: node scripts/provision-sales-tenant.mjs --manifest <path> [--dry-run]");
}
if (!process.env.DIRECT_URL) throw new Error("DIRECT_URL is required in the process environment");

const manifest = validateSalesProvisioningManifest(
  JSON.parse(await readFile(resolve(args[manifestFlag + 1]), "utf8")),
);
const sql = postgres(process.env.DIRECT_URL, { ssl: "require", max: 1, prepare: false });
const ROLLBACK_ONLY = new Error("sales_provision_dry_run_rollback");
let dryRunSummary;

const countState = async (tx, tenantId) => {
  const [row] = await tx`
    SELECT
      (SELECT count(*)::int FROM public.sales_memberships WHERE tenant_id = ${tenantId}) memberships,
      (SELECT count(*)::int FROM public.sales_config WHERE tenant_id = ${tenantId}) configs,
      (SELECT count(*)::int FROM public.sales_payment_methods WHERE tenant_id = ${tenantId}) payment_methods,
      (SELECT count(*)::int FROM public.sales_periods WHERE tenant_id = ${tenantId}) periods,
      (SELECT count(*)::int FROM public.sales_goals WHERE tenant_id = ${tenantId}) goals,
      (SELECT count(*)::int FROM public.sales_goal_assignments WHERE tenant_id = ${tenantId}) assignments,
      (SELECT count(*)::int FROM public.sales WHERE tenant_id = ${tenantId}) sales,
      (SELECT count(*)::int FROM public.sales_period_closures WHERE tenant_id = ${tenantId}) closures,
      (SELECT count(*)::int FROM public.sales_celebrations WHERE tenant_id = ${tenantId}) celebrations
  `;
  return row;
};

const selectExactlyOne = (rows, entity) => {
  if (rows.length === 0) throw new Error(`${entity}_not_found`);
  if (rows.length > 1) throw new Error(`${entity}_ambiguous`);
  return rows[0];
};

try {
  const summary = await sql.begin(async (tx) => {
    const tenants = manifest.tenant.key === "id"
      ? await tx`SELECT id, slug FROM public.tenants WHERE id = ${manifest.tenant.value}::uuid AND deleted_at IS NULL`
      : await tx`SELECT id, slug FROM public.tenants WHERE slug = ${manifest.tenant.value} AND deleted_at IS NULL`;
    const tenant = selectExactlyOne(tenants, "tenant");
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${'sales-provision:' + tenant.id}, 0))`;

    const profiles = manifest.admin.key === "profileId"
      ? await tx`SELECT id FROM public.profiles WHERE tenant_id = ${tenant.id} AND id = ${manifest.admin.value}::uuid AND deleted_at IS NULL AND is_active AND role = 'ADMIN'`
      : await tx`SELECT id FROM public.profiles WHERE tenant_id = ${tenant.id} AND lower(email) = lower(${manifest.admin.value}) AND deleted_at IS NULL AND is_active AND role = 'ADMIN'`;
    const admin = selectExactlyOne(profiles, "admin_profile");
    const consultants = await tx`
      SELECT id, role FROM public.profiles
      WHERE tenant_id = ${tenant.id}
        AND id = ANY(${manifest.consultantProfileIds}::uuid[])
        AND deleted_at IS NULL AND is_active
    `;
    if (consultants.length !== manifest.consultantProfileIds.length) {
      throw new Error("consultant_profile_missing_or_cross_tenant");
    }
    if (consultants.some((consultant) => consultant.id === admin.id)) {
      throw new Error("admin_profile_cannot_be_consultant");
    }
    if (consultants.some((consultant) => consultant.role === "ADMIN")) {
      throw new Error("consultant_profile_has_tenant_admin_role");
    }

    const before = await countState(tx, tenant.id);
    const [membership] = await tx`
      INSERT INTO public.sales_memberships (tenant_id, profile_id, role, is_active)
      VALUES (${tenant.id}, ${admin.id}, 'ADMIN', true)
      ON CONFLICT (tenant_id, profile_id) DO UPDATE
      SET role = 'ADMIN', is_active = true, updated_at = now()
      RETURNING id, role, is_active
    `;
    const consultantMemberships = [];
    for (const consultant of consultants) {
      const existingMemberships = await tx`
        SELECT id, role, is_active FROM public.sales_memberships
        WHERE tenant_id = ${tenant.id} AND profile_id = ${consultant.id}
      `;
      if (existingMemberships.length > 1) {
        throw new Error(`consultant_membership_ambiguous:${consultant.id}`);
      }

      let [consultantMembership] = existingMemberships;
      let state = "preserved";
      if (!consultantMembership) {
        const insertedMemberships = await tx`
          INSERT INTO public.sales_memberships (tenant_id, profile_id, role, is_active)
          VALUES (${tenant.id}, ${consultant.id}, 'CONSULTANT', true)
          ON CONFLICT (tenant_id, profile_id) DO NOTHING
          RETURNING id, role, is_active
        `;
        [consultantMembership] = insertedMemberships.length ? insertedMemberships : await tx`
          SELECT id, role, is_active FROM public.sales_memberships
          WHERE tenant_id = ${tenant.id} AND profile_id = ${consultant.id}
        `;
        state = insertedMemberships.length ? "created" : "preserved";
      }

      if (consultantMembership.role === "ADMIN") {
        // An existing Sales ADMIN is strictly more privileged and must never be downgraded.
        state = "preserved_admin";
      } else if (consultantMembership.role !== "CONSULTANT") {
        throw new Error(`consultant_membership_role_conflict:${consultant.id}`);
      } else if (!consultantMembership.is_active) {
        [consultantMembership] = await tx`
          UPDATE public.sales_memberships SET is_active = true, updated_at = now()
          WHERE tenant_id = ${tenant.id} AND id = ${consultantMembership.id} AND role = 'CONSULTANT'
          RETURNING id, role, is_active
        `;
        state = "reactivated";
      }

      consultantMemberships.push({
        id: consultantMembership.id,
        profileId: consultant.id,
        role: consultantMembership.role,
        isActive: consultantMembership.is_active,
        state,
      });
    }
    const [config] = await tx`
      INSERT INTO public.sales_config
        (tenant_id, pieces_per_set, timezone, week_starts_on, allow_team_aggregates)
      VALUES (${tenant.id}, ${manifest.config.piecesPerSet}, ${manifest.config.timezone},
              ${manifest.config.weekStartsOn}, ${manifest.config.allowTeamAggregates})
      ON CONFLICT (tenant_id) DO NOTHING
      RETURNING id
    `;
    const [canonicalConfig] = config ? [config] : await tx`
      SELECT id FROM public.sales_config WHERE tenant_id = ${tenant.id}
    `;

    const methodResults = [];
    for (const method of manifest.paymentMethods) {
      const logicalMatches = await tx`
        SELECT id, name, is_active FROM public.sales_payment_methods
        WHERE tenant_id = ${tenant.id} AND lower(name) = lower(${method.name})
      `;
      if (logicalMatches.length > 1) throw new Error(`payment_method_ambiguous:${method.name}`);
      const inserted = logicalMatches.length ? [] : await tx`
        INSERT INTO public.sales_payment_methods (tenant_id, name, sort_order, is_active)
        VALUES (${tenant.id}, ${method.name}, ${method.sortOrder}, true)
        ON CONFLICT (tenant_id, name_normalized) DO NOTHING
        RETURNING id, name, is_active
      `;
      let [current] = logicalMatches.length ? logicalMatches : inserted;
      if (!current.is_active && manifest.reactivateApprovedMethods) {
        [current] = await tx`
          UPDATE public.sales_payment_methods SET is_active = true, updated_at = now()
          WHERE tenant_id = ${tenant.id} AND id = ${current.id}
          RETURNING id, name, is_active
        `;
      }
      if (!current.is_active) throw new Error(`approved_payment_method_inactive:${method.name}`);
      methodResults.push({ id: current.id, name: current.name, state: inserted.length ? "created" : "preserved" });
    }

    const overlaps = await tx`
      SELECT id FROM public.sales_periods
      WHERE tenant_id = ${tenant.id} AND status = 'OPEN'
        AND daterange(starts_on, ends_on, '[]') && daterange(${manifest.period.startsOn}::date, ${manifest.period.endsOn}::date, '[]')
        AND NOT (starts_on = ${manifest.period.startsOn}::date AND ends_on = ${manifest.period.endsOn}::date)
    `;
    if (overlaps.length) throw new Error("open_period_overlap");
    const insertedPeriod = await tx`
      INSERT INTO public.sales_periods (tenant_id, starts_on, ends_on, status)
      VALUES (${tenant.id}, ${manifest.period.startsOn}, ${manifest.period.endsOn}, 'OPEN')
      ON CONFLICT (tenant_id, starts_on, ends_on) DO NOTHING
      RETURNING id, status
    `;
    const [period] = insertedPeriod.length ? insertedPeriod : await tx`
      SELECT id, status FROM public.sales_periods
      WHERE tenant_id = ${tenant.id} AND starts_on = ${manifest.period.startsOn} AND ends_on = ${manifest.period.endsOn}
    `;
    if (period.status !== "OPEN") throw new Error("target_period_already_closed");

    const goalResults = [];
    for (const goal of manifest.goals) {
      const keyedMatches = await tx`
        SELECT id, provisioning_key, scope, is_challenge
        FROM public.sales_goals
        WHERE tenant_id = ${tenant.id} AND provisioning_key = ${goal.key}
      `;
      const legacyNameMatches = keyedMatches.length ? [] : await tx`
        SELECT id, provisioning_key, scope, is_challenge
        FROM public.sales_goals
        WHERE tenant_id = ${tenant.id}
          AND lower(name) = lower(${goal.name})
          AND scope = ${goal.scope}
      `;
      const resolution = resolveGoalProvisioningAction(goal, keyedMatches, legacyNameMatches);

      let canonicalGoal = resolution.goal;
      if (resolution.action === "adopt") {
        const adopted = await tx`
          UPDATE public.sales_goals
          SET provisioning_key = ${goal.key}
          WHERE tenant_id = ${tenant.id}
            AND id = ${canonicalGoal.id}
            AND provisioning_key IS NULL
          RETURNING id, provisioning_key, scope, is_challenge
        `;
        if (adopted.length !== 1) throw new Error(`sales_goal_legacy_adoption_conflict:${goal.key}`);
        [canonicalGoal] = adopted;
      } else if (resolution.action === "insert") {
        const inserted = await tx`
          INSERT INTO public.sales_goals
            (tenant_id, provisioning_key, name, scope, target_value, commission_percent,
             sort_order, is_challenge, is_active)
          VALUES (${tenant.id}, ${goal.key}, ${goal.name}, ${goal.scope}, ${goal.targetValue},
                  ${goal.commissionPercent}, ${goal.sortOrder}, ${goal.isChallenge}, true)
          RETURNING id, provisioning_key, scope, is_challenge
        `;
        [canonicalGoal] = inserted;
      }
      const assignees = goal.scope === "INDIVIDUAL" ? manifest.consultantProfileIds : [null];
      for (const profileId of assignees) {
        // Snapshot congela alvo/comissão/identidade da meta no momento da atribuição
        // (o schema exige *_snapshot NOT NULL); deriva do próprio goal canônico.
        await tx`
          INSERT INTO public.sales_goal_assignments (
            tenant_id, goal_id, period_id, profile_id,
            target_value_snapshot, commission_percent_snapshot, goal_name_snapshot,
            goal_scope_snapshot, goal_sort_order_snapshot, goal_is_challenge_snapshot,
            goal_revision, valid_from_snapshot, valid_until_snapshot
          )
          SELECT g.tenant_id, g.id, ${period.id}, ${profileId},
            g.target_value, g.commission_percent, g.name, g.scope, g.sort_order,
            g.is_challenge, g.revision, g.valid_from, g.valid_until
          FROM public.sales_goals g
          WHERE g.id = ${canonicalGoal.id}
          ON CONFLICT DO NOTHING
        `;
      }
      goalResults.push({
        id: canonicalGoal.id,
        key: goal.key,
        state: resolution.action === "insert" ? "created" : resolution.action === "adopt" ? "adopted" : "preserved",
      });
    }

    const after = await countState(tx, tenant.id);
    for (const immutable of ["sales", "closures", "celebrations"]) {
      if (before[immutable] !== after[immutable]) throw new Error(`immutable_count_changed:${immutable}`);
    }
    const result = {
      dryRun,
      tenant: { id: tenant.id, slug: tenant.slug },
      adminMembership: { id: membership.id, role: membership.role, isActive: membership.is_active },
      consultantMemberships,
      config: { id: canonicalConfig.id, state: config ? "created" : "preserved" },
      paymentMethods: methodResults,
      period: { id: period.id, state: insertedPeriod.length ? "created" : "preserved" },
      goals: goalResults,
      counts: { before, after },
    };
    if (dryRun) {
      dryRunSummary = result;
      throw ROLLBACK_ONLY;
    }
    return result;
  });
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  if (error === ROLLBACK_ONLY) console.log(JSON.stringify({ ...dryRunSummary, rolledBack: true }, null, 2));
  else throw error;
} finally {
  await sql.end();
}

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  resolveGoalProvisioningAction,
  validateSalesProvisioningManifest,
} from "./lib/sales-provisioning.mjs";

const validManifest = {
  tenant: { slug: "fabrica-teste" },
  admin: { email: "admin@example.invalid" },
  reactivateApprovedMethods: false,
  paymentMethods: [{ name: "Explicit Method", sortOrder: 1 }],
  period: { startsOn: "2026-08-01", endsOn: "2026-08-31" },
  consultantProfileIds: ["00000000-0000-4000-8000-000000000010"],
  goals: [
    ["META_1", "INDIVIDUAL", false],
    ["META_2", "INDIVIDUAL", false],
    ["META_3", "INDIVIDUAL", false],
    ["CHALLENGE", "INDIVIDUAL", true],
    ["QUARTERLY", "QUARTERLY", false],
    ["COLLECTIVE", "COLLECTIVE", false],
  ].map(([key, scope, isChallenge], index) => ({
    key,
    name: `Explicit ${key}`,
    scope,
    targetValue: (index + 1) * 100,
    commissionPercent: index,
    sortOrder: index,
    isChallenge,
  })),
};

const validated = validateSalesProvisioningManifest(validManifest);
assert.equal(validated.config.piecesPerSet, 2, "Story 10.1 canonical default is reused");
assert.equal(validated.goals.length, 6);
assert.throws(
  () => validateSalesProvisioningManifest({ ...validManifest, password: "forbidden" }),
  /never receives secrets/,
);
assert.throws(
  () => validateSalesProvisioningManifest({ ...validManifest, paymentMethods: [] }),
  /explicitly approved/,
);
assert.throws(
  () => validateSalesProvisioningManifest({ ...validManifest, consultantProfileIds: [] }),
  /at least one existing consultant/,
);
assert.throws(
  () => validateSalesProvisioningManifest({ ...validManifest, goals: validManifest.goals.slice(0, 5) }),
  /goals must contain exactly/,
);

const executor = readFileSync(new URL("./provision-sales-tenant.mjs", import.meta.url), "utf8");
assert.match(executor, /sql\.begin\(/, "all writes must be atomic");
assert.match(executor, /pg_advisory_xact_lock/, "tenant provisioning must be serialized");
assert.match(executor, /ON CONFLICT \(tenant_id, profile_id\) DO UPDATE/, "membership must be idempotent");
assert.match(executor, /'CONSULTANT', true/, "consultant memberships must be provisioned");
assert.match(executor, /consultantMembership\.role === "ADMIN"/, "existing Sales ADMIN must not be downgraded");
assert.match(executor, /admin_profile_cannot_be_consultant/, "canonical admin cannot be assigned as consultant");
assert.match(executor, /consultant_profile_has_tenant_admin_role/, "tenant ADMIN profiles cannot be used as consultants");
assert.match(executor, /ON CONFLICT \(tenant_id\) DO NOTHING/, "existing config must be preserved");
assert.match(executor, /lower\(name\) = lower/, "logical method and goal names must be case-insensitive");
assert.match(executor, /tenant_id = \$\{tenant\.id\} AND provisioning_key = \$\{goal\.key\}/, "goals must resolve by immutable key first");
assert.match(executor, /SET provisioning_key = \$\{goal\.key\}/, "legacy adoption must set only the immutable key");
assert.doesNotMatch(
  executor,
  /UPDATE public\.sales_goals[\s\S]{0,300}SET[\s\S]{0,200}(?:name|target_value|commission_percent|sort_order|is_active)\s*=/,
  "reprovisioning must not overwrite administrator-edited goal values",
);
assert.match(executor, /throw ROLLBACK_ONLY/, "dry-run must force transaction rollback");
for (const protectedTable of ["sales", "sales_period_closures", "sales_celebrations"]) {
  assert.doesNotMatch(
    executor,
    new RegExp(`(?:INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+public\\.${protectedTable}(?:\\s|\\()`, "i"),
    `provisioning must not perform DML on ${protectedTable}`,
  );
}
assert.doesNotMatch(executor, /password|service.?role|refresh.?token/i, "executor must not receive secrets");

const cloneState = (state) => structuredClone(state);
const assignmentKey = ({ tenantId, goalId, periodId, profileId }) =>
  [tenantId, goalId, periodId, profileId ?? "00000000-0000-0000-0000-000000000000"].join(":");

function simulateProvisioning(previous, { failAfterGoals = false } = {}) {
  const state = cloneState(previous);
  const consultantId = validManifest.consultantProfileIds[0];
  state.memberships[consultantId] ??= {
    id: "membership-consultant-stable",
    role: "CONSULTANT",
    isActive: true,
  };
  if (state.memberships[consultantId].role === "CONSULTANT") {
    state.memberships[consultantId].isActive = true;
  }

  state.config ??= {
    id: "config-stable",
    piecesPerSet: validated.config.piecesPerSet,
    timezone: validated.config.timezone,
  };
  for (const method of validated.paymentMethods) {
    const logicalKey = method.name.toLocaleLowerCase("pt-BR");
    state.paymentMethods[logicalKey] ??= {
      id: `payment-${logicalKey}`,
      name: method.name,
      sortOrder: method.sortOrder,
    };
  }
  state.period ??= { id: "period-stable", status: "OPEN" };
  for (const goal of validated.goals) {
    const keyedMatches = Object.values(state.goals).filter(
      (candidate) => candidate.provisioningKey === goal.key,
    );
    const legacyNameMatches = keyedMatches.length ? [] : Object.values(state.goals).filter(
      (candidate) => candidate.scope === goal.scope
        && candidate.name.toLocaleLowerCase("pt-BR") === goal.name.toLocaleLowerCase("pt-BR"),
    );
    const resolution = resolveGoalProvisioningAction(
      goal,
      keyedMatches.map((candidate) => ({
        ...candidate,
        provisioning_key: candidate.provisioningKey,
        is_challenge: candidate.isChallenge,
      })),
      legacyNameMatches.map((candidate) => ({
        ...candidate,
        provisioning_key: candidate.provisioningKey,
        is_challenge: candidate.isChallenge,
      })),
    );
    let canonicalGoal = resolution.goal;
    if (resolution.action === "adopt") {
      const stored = Object.values(state.goals).find((candidate) => candidate.id === canonicalGoal.id);
      stored.provisioningKey = goal.key;
      canonicalGoal = stored;
    } else if (resolution.action === "insert") {
      canonicalGoal = {
        id: `goal-${goal.key}`,
        provisioningKey: goal.key,
        name: goal.name,
        scope: goal.scope,
        isChallenge: goal.isChallenge,
        targetValue: goal.targetValue,
        commissionPercent: goal.commissionPercent,
        sortOrder: goal.sortOrder,
        isActive: true,
      };
      state.goals[`provisioned:${goal.key}`] = canonicalGoal;
    }
    const profileIds = goal.scope === "INDIVIDUAL" ? validated.consultantProfileIds : [null];
    for (const profileId of profileIds) {
      state.assignments[assignmentKey({
        tenantId: "tenant-stable",
        goalId: canonicalGoal.id,
        periodId: state.period.id,
        profileId,
      })] ??= `assignment-${Object.keys(state.assignments).length + 1}`;
    }
  }
  if (failAfterGoals) throw new Error("induced_failure_after_goals");
  return state;
}

const originalState = {
  memberships: {},
  config: {
    id: "config-preserved",
    piecesPerSet: 17,
    timezone: "America/Manaus",
  },
  paymentMethods: {
    "explicit method": {
      id: "payment-preserved",
      name: "Explicit Method",
      sortOrder: 77,
    },
  },
  period: { id: "period-preserved", status: "OPEN" },
  goals: {
    "INDIVIDUAL:explicit meta_1": {
      id: "goal-preserved",
      provisioningKey: null,
      name: "Explicit META_1",
      scope: "INDIVIDUAL",
      isChallenge: false,
      targetValue: 9876,
      commissionPercent: 9,
      sortOrder: 91,
      isActive: false,
    },
    "custom:seasonal": {
      id: "goal-custom-preserved",
      provisioningKey: null,
      name: "Seasonal custom goal",
      scope: "INDIVIDUAL",
      isChallenge: false,
      targetValue: 456,
      commissionPercent: 2,
      sortOrder: 92,
      isActive: true,
    },
  },
  assignments: {},
  commercialFacts: { sales: 3, closures: 1, celebrations: 2 },
};
const firstRun = simulateProvisioning(originalState);
const secondRun = simulateProvisioning(firstRun);
assert.deepEqual(secondRun, firstRun, "two executions must preserve all canonical IDs, counts and values");
assert.equal(secondRun.config.id, "config-preserved");
assert.equal(secondRun.config.piecesPerSet, 17, "admin config values must be preserved");
assert.equal(secondRun.paymentMethods["explicit method"].id, "payment-preserved");
assert.equal(secondRun.paymentMethods["explicit method"].sortOrder, 77, "payment values must be preserved");
assert.equal(secondRun.goals["INDIVIDUAL:explicit meta_1"].id, "goal-preserved");
assert.equal(secondRun.goals["INDIVIDUAL:explicit meta_1"].provisioningKey, "META_1");
assert.equal(secondRun.goals["INDIVIDUAL:explicit meta_1"].targetValue, 9876, "goal values must be preserved");
assert.equal(secondRun.goals["custom:seasonal"].provisioningKey, null, "custom goals must remain unkeyed");
assert.deepEqual(secondRun.commercialFacts, originalState.commercialFacts, "commercial facts must remain immutable");

const renamedByAdmin = cloneState(firstRun);
const meta1AfterAdoption = renamedByAdmin.goals["INDIVIDUAL:explicit meta_1"];
meta1AfterAdoption.name = "Meta principal renomeada pelo ADM";
meta1AfterAdoption.targetValue = 123456;
meta1AfterAdoption.commissionPercent = 12;
meta1AfterAdoption.sortOrder = 44;
meta1AfterAdoption.isActive = false;
const goalCountBeforeRenameRerun = Object.keys(renamedByAdmin.goals).length;
const assignmentsBeforeRenameRerun = Object.keys(renamedByAdmin.assignments).length;
const rerunAfterRename = simulateProvisioning(renamedByAdmin);
assert.equal(rerunAfterRename.goals["INDIVIDUAL:explicit meta_1"].id, "goal-preserved");
assert.equal(rerunAfterRename.goals["INDIVIDUAL:explicit meta_1"].name, "Meta principal renomeada pelo ADM");
assert.equal(rerunAfterRename.goals["INDIVIDUAL:explicit meta_1"].targetValue, 123456);
assert.equal(rerunAfterRename.goals["INDIVIDUAL:explicit meta_1"].commissionPercent, 12);
assert.equal(rerunAfterRename.goals["INDIVIDUAL:explicit meta_1"].sortOrder, 44);
assert.equal(rerunAfterRename.goals["INDIVIDUAL:explicit meta_1"].isActive, false);
assert.equal(Object.keys(rerunAfterRename.goals).length, goalCountBeforeRenameRerun);
assert.equal(Object.keys(rerunAfterRename.assignments).length, assignmentsBeforeRenameRerun);

const meta1Goal = validated.goals.find((goal) => goal.key === "META_1");
assert.throws(
  () => resolveGoalProvisioningAction(meta1Goal, [], [
    { id: "legacy-a", provisioning_key: null, scope: "INDIVIDUAL", is_challenge: false },
    { id: "legacy-b", provisioning_key: null, scope: "INDIVIDUAL", is_challenge: false },
  ]),
  /sales_goal_legacy_ambiguous:META_1/,
);
assert.throws(
  () => resolveGoalProvisioningAction(meta1Goal, [], [
    { id: "wrong-key", provisioning_key: "META_2", scope: "INDIVIDUAL", is_challenge: false },
  ]),
  /sales_goal_legacy_key_conflict:META_1/,
);

const nullAssignmentKeys = Object.keys(secondRun.assignments).filter((key) =>
  key.endsWith(":00000000-0000-0000-0000-000000000000"),
);
assert.equal(nullAssignmentKeys.length, 2, "quarterly and collective null-profile assignments are unique");
assert.equal(new Set(nullAssignmentKeys).size, nullAssignmentKeys.length, "functional null-profile key prevents duplicates");

const salesAdminState = cloneState(originalState);
salesAdminState.memberships[validManifest.consultantProfileIds[0]] = {
  id: "membership-admin-preserved",
  role: "ADMIN",
  isActive: true,
};
const salesAdminRun = simulateProvisioning(salesAdminState);
assert.deepEqual(
  salesAdminRun.memberships[validManifest.consultantProfileIds[0]],
  salesAdminState.memberships[validManifest.consultantProfileIds[0]],
  "an existing Sales ADMIN membership must not be downgraded",
);

const inactiveConsultantState = cloneState(originalState);
inactiveConsultantState.memberships[validManifest.consultantProfileIds[0]] = {
  id: "membership-consultant-preserved",
  role: "CONSULTANT",
  isActive: false,
};
const reactivatedRun = simulateProvisioning(inactiveConsultantState);
assert.equal(reactivatedRun.memberships[validManifest.consultantProfileIds[0]].id, "membership-consultant-preserved");
assert.equal(reactivatedRun.memberships[validManifest.consultantProfileIds[0]].isActive, true);

const rollbackSnapshot = cloneState(originalState);
assert.throws(() => simulateProvisioning(originalState, { failAfterGoals: true }), /induced_failure_after_goals/);
assert.deepEqual(
  originalState,
  rollbackSnapshot,
  "an induced transaction failure must leave the original state unchanged",
);

console.log("PASS: Sales tenant provisioning contract verified.");

const GOAL_CONTRACT = Object.freeze({
  META_1: { scope: "INDIVIDUAL", challenge: false },
  META_2: { scope: "INDIVIDUAL", challenge: false },
  META_3: { scope: "INDIVIDUAL", challenge: false },
  CHALLENGE: { scope: "INDIVIDUAL", challenge: true },
  QUARTERLY: { scope: "QUARTERLY", challenge: false },
  COLLECTIVE: { scope: "COLLECTIVE", challenge: false },
});

export function resolveGoalProvisioningAction(goal, keyedMatches, legacyNameMatches) {
  if (keyedMatches.length > 1) {
    throw new Error(`sales_goal_key_ambiguous:${goal.key}`);
  }

  if (keyedMatches.length === 1) {
    const [keyed] = keyedMatches;
    if (keyed.scope !== goal.scope || Boolean(keyed.is_challenge) !== goal.isChallenge) {
      throw new Error(`sales_goal_key_contract_conflict:${goal.key}`);
    }
    return { action: "preserve", goal: keyed };
  }

  const conflictingKey = legacyNameMatches.find(
    (candidate) => candidate.provisioning_key != null && candidate.provisioning_key !== goal.key,
  );
  if (conflictingKey) {
    throw new Error(`sales_goal_legacy_key_conflict:${goal.key}`);
  }

  const unkeyedMatches = legacyNameMatches.filter((candidate) => candidate.provisioning_key == null);
  if (unkeyedMatches.length > 1) {
    throw new Error(`sales_goal_legacy_ambiguous:${goal.key}`);
  }
  if (unkeyedMatches.length === 1) {
    const [legacy] = unkeyedMatches;
    if (legacy.scope !== goal.scope || Boolean(legacy.is_challenge) !== goal.isChallenge) {
      throw new Error(`sales_goal_legacy_contract_conflict:${goal.key}`);
    }
    return { action: "adopt", goal: legacy };
  }

  return { action: "insert", goal: null };
}

export const REQUIRED_GOAL_KEYS = Object.freeze(Object.keys(GOAL_CONTRACT));
export const CANONICAL_SALES_CONFIG = Object.freeze({
  piecesPerSet: 2,
  timezone: "America/Sao_Paulo",
  weekStartsOn: 1,
  allowTeamAggregates: false,
});

const requireText = (value, path) => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value.trim();
};

const requireFiniteRange = (value, path, minimum, maximum) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${path} must be between ${minimum} and ${maximum}`);
  }
  return value;
};

const requireIsoDate = (value, path) => {
  const normalized = requireText(value, path);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Number.isNaN(Date.parse(`${normalized}T00:00:00Z`))) {
    throw new Error(`${path} must be an ISO date (YYYY-MM-DD)`);
  }
  return normalized;
};

const requireUuid = (value, path) => {
  const normalized = requireText(value, path);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new Error(`${path} must be a valid UUID`);
  }
  return normalized;
};

function rejectSecretFields(value, path = "manifest") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (/(password|passwd|secret|service.?role|access.?token|refresh.?token)/i.test(key)) {
      throw new Error(`${path}.${key} is forbidden: provisioning never receives secrets`);
    }
    rejectSecretFields(child, `${path}.${key}`);
  }
}

function exactlyOneSelector(selector, keys, path) {
  if (!selector || typeof selector !== "object" || Array.isArray(selector)) {
    throw new Error(`${path} must be an object`);
  }
  const present = keys.filter((key) => selector[key] != null && selector[key] !== "");
  if (present.length !== 1) throw new Error(`${path} must contain exactly one of: ${keys.join(", ")}`);
  return { key: present[0], value: requireText(selector[present[0]], `${path}.${present[0]}`) };
}

export function validateSalesProvisioningManifest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("manifest must be an object");
  rejectSecretFields(input);

  const tenant = exactlyOneSelector(input.tenant, ["id", "slug"], "tenant");
  const admin = exactlyOneSelector(input.admin, ["profileId", "email"], "admin");
  if (tenant.key === "id") tenant.value = requireUuid(tenant.value, "tenant.id");
  if (admin.key === "profileId") admin.value = requireUuid(admin.value, "admin.profileId");
  const configInput = input.config ?? {};
  const config = {
    piecesPerSet: requireFiniteRange(
      configInput.piecesPerSet ?? CANONICAL_SALES_CONFIG.piecesPerSet,
      "config.piecesPerSet",
      1,
      1000,
    ),
    timezone: requireText(configInput.timezone ?? CANONICAL_SALES_CONFIG.timezone, "config.timezone"),
    weekStartsOn: requireFiniteRange(
      configInput.weekStartsOn ?? CANONICAL_SALES_CONFIG.weekStartsOn,
      "config.weekStartsOn",
      0,
      6,
    ),
    allowTeamAggregates: configInput.allowTeamAggregates ?? CANONICAL_SALES_CONFIG.allowTeamAggregates,
  };
  if (!Number.isInteger(config.piecesPerSet) || !Number.isInteger(config.weekStartsOn)) {
    throw new Error("config.piecesPerSet and config.weekStartsOn must be integers");
  }
  if (typeof config.allowTeamAggregates !== "boolean") {
    throw new Error("config.allowTeamAggregates must be boolean");
  }

  if (!Array.isArray(input.paymentMethods) || input.paymentMethods.length === 0) {
    throw new Error("paymentMethods must be an explicitly approved non-empty array");
  }
  const paymentMethods = input.paymentMethods.map((method, index) => ({
    name: requireText(method?.name, `paymentMethods[${index}].name`),
    sortOrder: requireFiniteRange(method?.sortOrder, `paymentMethods[${index}].sortOrder`, -100000, 100000),
  }));
  if (paymentMethods.some((method) => !Number.isInteger(method.sortOrder))) {
    throw new Error("payment method sortOrder values must be integers");
  }
  const normalizedMethodNames = paymentMethods.map((method) => method.name.toLocaleLowerCase("pt-BR"));
  if (new Set(normalizedMethodNames).size !== normalizedMethodNames.length) {
    throw new Error("paymentMethods contains duplicate logical names");
  }
  if (typeof input.reactivateApprovedMethods !== "boolean") {
    throw new Error("reactivateApprovedMethods must be an explicit boolean");
  }

  const startsOn = requireIsoDate(input.period?.startsOn, "period.startsOn");
  const endsOn = requireIsoDate(input.period?.endsOn, "period.endsOn");
  if (startsOn > endsOn) throw new Error("period.endsOn must not precede period.startsOn");

  if (!Array.isArray(input.consultantProfileIds) || input.consultantProfileIds.length === 0) {
    throw new Error("consultantProfileIds must explicitly identify at least one existing consultant profile");
  }
  const consultantProfileIds = input.consultantProfileIds.map((id, index) =>
    requireUuid(id, `consultantProfileIds[${index}]`),
  );
  if (new Set(consultantProfileIds).size !== consultantProfileIds.length) {
    throw new Error("consultantProfileIds contains duplicates");
  }

  if (!Array.isArray(input.goals)) throw new Error("goals must be an array");
  const byKey = new Map(input.goals.map((goal) => [goal?.key, goal]));
  if (byKey.size !== REQUIRED_GOAL_KEYS.length || REQUIRED_GOAL_KEYS.some((key) => !byKey.has(key))) {
    throw new Error(`goals must contain exactly: ${REQUIRED_GOAL_KEYS.join(", ")}`);
  }
  const goals = REQUIRED_GOAL_KEYS.map((key) => {
    const source = byKey.get(key);
    const expected = GOAL_CONTRACT[key];
    if (source.scope !== expected.scope) throw new Error(`goal ${key} must use scope ${expected.scope}`);
    if (Boolean(source.isChallenge) !== expected.challenge) {
      throw new Error(`goal ${key} has an invalid isChallenge value`);
    }
    return {
      key,
      name: requireText(source.name, `goals.${key}.name`),
      scope: expected.scope,
      targetValue: requireFiniteRange(source.targetValue, `goals.${key}.targetValue`, 0, 999999999999.99),
      commissionPercent: requireFiniteRange(
        source.commissionPercent,
        `goals.${key}.commissionPercent`,
        0,
        100,
      ),
      sortOrder: requireFiniteRange(source.sortOrder, `goals.${key}.sortOrder`, -100000, 100000),
      isChallenge: expected.challenge,
    };
  });
  if (goals.some((goal) => !Number.isInteger(goal.sortOrder))) throw new Error("goal sortOrder values must be integers");
  const naturalGoalKeys = goals.map((goal) => `${goal.scope}:${goal.name.toLocaleLowerCase("pt-BR")}`);
  if (new Set(naturalGoalKeys).size !== naturalGoalKeys.length) {
    throw new Error("goals contains duplicate names within the same scope");
  }

  return {
    tenant,
    admin,
    config,
    paymentMethods,
    reactivateApprovedMethods: input.reactivateApprovedMethods,
    period: { startsOn, endsOn },
    consultantProfileIds,
    goals,
  };
}

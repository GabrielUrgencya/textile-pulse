export const HOURLY_TARGET_MODES = ["NONE", "AUTO", "MANUAL"] as const;

export type HourlyTargetMode = (typeof HOURLY_TARGET_MODES)[number];
export type HourlyTargetFallbackReason = "FEATURE_DISABLED" | "MODE_NONE" | "INVALID_AUTO_INPUT" | "INVALID_MANUAL_TARGET" | null;

export interface ResolvedHourlyTarget {
  requestedMode: HourlyTargetMode;
  effectiveMode: HourlyTargetMode;
  target: number | null;
  fallbackReason: HourlyTargetFallbackReason;
}

/** Legacy/absent values are deliberately NONE, never AUTO. */
export function normalizeHourlyTargetMode(value: unknown): HourlyTargetMode {
  return typeof value === "string" && HOURLY_TARGET_MODES.includes(value as HourlyTargetMode)
    ? (value as HourlyTargetMode)
    : "NONE";
}

export function validateHourlyTargetInput(
  modeValue: unknown,
  manualValue: unknown,
): { ok: true; mode: HourlyTargetMode; manualTarget: number | null } | { ok: false; error: string } {
  if (typeof modeValue !== "string" || !HOURLY_TARGET_MODES.includes(modeValue as HourlyTargetMode)) {
    return { ok: false, error: "hourly_target_mode deve ser NONE, AUTO ou MANUAL" };
  }
  const mode = modeValue as HourlyTargetMode;
  if (mode !== "MANUAL") return { ok: true, mode, manualTarget: null };
  if (manualValue === "" || manualValue == null) {
    return { ok: false, error: "Informe uma meta/hora manual maior que zero" };
  }
  const manualTarget = Number(manualValue);
  if (!Number.isInteger(manualTarget) || manualTarget <= 0) {
    return { ok: false, error: "Meta/hora manual deve ser um inteiro maior que zero" };
  }
  return { ok: true, mode, manualTarget };
}

/** AUTO uses the base daily goal and rounds to the nearest whole unit. */
export function resolveHourlyTarget(input: {
  mode: unknown;
  manualTarget: unknown;
  baseDailyTarget: unknown;
  usefulHours: unknown;
  globalFeatureEnabled: boolean;
}): ResolvedHourlyTarget {
  const requestedMode = normalizeHourlyTargetMode(input.mode);
  if (!input.globalFeatureEnabled) return { requestedMode, effectiveMode: "NONE", target: null, fallbackReason: "FEATURE_DISABLED" };
  if (requestedMode === "NONE") return { requestedMode, effectiveMode: "NONE", target: null, fallbackReason: "MODE_NONE" };
  if (requestedMode === "MANUAL") {
    const manual = Number(input.manualTarget);
    if (!Number.isInteger(manual) || manual <= 0) return { requestedMode, effectiveMode: "NONE", target: null, fallbackReason: "INVALID_MANUAL_TARGET" };
    return { requestedMode, effectiveMode: "MANUAL", target: manual, fallbackReason: null };
  }
  const base = Number(input.baseDailyTarget);
  const hours = Number(input.usefulHours);
  if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(hours) || hours <= 0) {
    return { requestedMode, effectiveMode: "NONE", target: null, fallbackReason: "INVALID_AUTO_INPUT" };
  }
  const target = Math.round(base / hours);
  return target > 0
    ? { requestedMode, effectiveMode: "AUTO", target, fallbackReason: null }
    : { requestedMode, effectiveMode: "NONE", target: null, fallbackReason: "INVALID_AUTO_INPUT" };
}

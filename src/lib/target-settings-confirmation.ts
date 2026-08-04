export interface TargetTimeSettings {
  shiftStart: string;
  shiftEnd: string;
  lunchStart: string;
  lunchEnd: string;
  hourlyMetaEnabled: boolean;
}

/** Prevent a success toast when the server did not echo the target time settings it saved. */
export function confirmsTargetTimeSave(
  settings: unknown,
  expected: TargetTimeSettings,
): boolean {
  if (!settings || typeof settings !== "object") return false;
  const saved = settings as Partial<TargetTimeSettings>;
  return (
    saved.shiftStart === expected.shiftStart &&
    saved.shiftEnd === expected.shiftEnd &&
    saved.lunchStart === expected.lunchStart &&
    saved.lunchEnd === expected.lunchEnd &&
    saved.hourlyMetaEnabled === expected.hourlyMetaEnabled
  );
}

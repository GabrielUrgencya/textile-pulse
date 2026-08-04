/** True only while an hourly target is applicable to the current work window. */
export function isActiveHourlyTargetWindow(
  nowMinutes: number,
  shiftStart: number | null,
  shiftEnd: number | null,
  lunchStart: number | null,
  lunchEnd: number | null,
): boolean {
  if (shiftStart == null || shiftEnd == null || shiftEnd <= shiftStart) return false;
  if (nowMinutes < shiftStart || nowMinutes >= shiftEnd) return false;

  return !(
    lunchStart != null &&
    lunchEnd != null &&
    lunchEnd > lunchStart &&
    nowMinutes >= lunchStart &&
    nowMinutes < lunchEnd
  );
}

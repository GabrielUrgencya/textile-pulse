/**
 * Business days utilities for deadline calculations.
 * Story 6.3 (AC7) — Excludes Saturdays and Sundays.
 * Phase 2: configurable holidays per tenant.
 */

/**
 * Checks if a given date falls on a business day (Mon-Fri).
 */
export function isBusinessDay(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6; // 0 = Sunday, 6 = Saturday
}

/**
 * Adds N business days to a date, skipping weekends.
 * Returns a new Date without mutating the input.
 */
export function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let remaining = days;

  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    if (isBusinessDay(result)) {
      remaining--;
    }
  }

  return result;
}

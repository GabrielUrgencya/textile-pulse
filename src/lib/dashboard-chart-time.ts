import { TENANT_TZ } from "@/lib/tz";

/**
 * The dashboard RPC emits UTC hourly buckets as text without an offset.
 * Treat those values as UTC and render their hour in the tenant timezone.
 */
export function chartPeriodToTenantHour(period: string): string {
  if (!period.includes("T")) return period;

  const timestamp = /(?:Z|[+-]\d{2}:?\d{2})$/.test(period) ? period : `${period}Z`;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return period;

  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: TENANT_TZ,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(date);

  return `${hour}h`;
}

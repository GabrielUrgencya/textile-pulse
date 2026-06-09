/**
 * OpsClock time calculation utilities.
 * Story 8.6 — driver wait time tracking.
 */

export interface OpsClockRecord {
  id: string;
  driver_id: string;
  arrived_at: string;
  loading_started_at: string | null;
  loading_ended_at: string | null;
  departed_at: string | null;
  drivers?: { name: string; vehicle_plate?: string | null };
}

export type OpsClockStatus = "waiting" | "loading" | "loaded" | "departed";

export function getStatus(record: OpsClockRecord): OpsClockStatus {
  if (record.departed_at) return "departed";
  if (record.loading_ended_at) return "loaded";
  if (record.loading_started_at) return "loading";
  return "waiting";
}

/** Minutes since a given ISO timestamp */
export function minutesSince(isoDate: string): number {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / 60000);
}

/** Wait time color: neutral (<30min), amber (30-60), red (>60) */
export function getWaitColor(
  record: OpsClockRecord
): "neutral" | "amber" | "red" | "blue" {
  const status = getStatus(record);
  if (status === "loading") return "blue";
  if (status === "departed" || status === "loaded") return "neutral";

  const mins = minutesSince(record.arrived_at);
  if (mins >= 60) return "red";
  if (mins >= 30) return "amber";
  return "neutral";
}

/** Calculate wait duration in minutes (arrived → loading_started or now) */
export function waitDuration(record: OpsClockRecord): number {
  const end = record.loading_started_at
    ? new Date(record.loading_started_at).getTime()
    : Date.now();
  return Math.floor((end - new Date(record.arrived_at).getTime()) / 60000);
}

/** Calculate loading duration in minutes */
export function loadingDuration(record: OpsClockRecord): number {
  if (!record.loading_started_at) return 0;
  const end = record.loading_ended_at
    ? new Date(record.loading_ended_at).getTime()
    : Date.now();
  return Math.floor(
    (end - new Date(record.loading_started_at).getTime()) / 60000
  );
}

/** Format minutes as "Xh Ym" or "Ym" */
export function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins}min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

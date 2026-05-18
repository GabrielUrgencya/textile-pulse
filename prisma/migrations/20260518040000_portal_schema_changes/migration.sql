-- Story 6.2: Portal Schema Changes
-- Adds fields to faction_shipments, defect_records, and notifications
-- to support faction confirmation, defect contestation, rescheduling, and faction notifications.

-- ============================================================
-- T1 (AC1): faction_shipments — 5 new columns
-- ============================================================
ALTER TABLE "faction_shipments"
  ADD COLUMN "faction_confirmed_at" TIMESTAMPTZ,
  ADD COLUMN "faction_estimated_return" DATE,
  ADD COLUMN "faction_estimated_return_at" TIMESTAMPTZ,
  ADD COLUMN "reschedule_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "last_rescheduled_at" TIMESTAMPTZ;

-- ============================================================
-- T2 (AC2): defect_records — 4 new columns with CHECK constraint
-- ============================================================
ALTER TABLE "defect_records"
  ADD COLUMN "faction_response" TEXT,
  ADD COLUMN "faction_response_at" TIMESTAMPTZ,
  ADD COLUMN "contestation_reason" TEXT,
  ADD COLUMN "contestation_resolved_at" TIMESTAMPTZ;

-- CHECK constraint for faction_response enum values (not using Postgres ENUM for simplicity)
ALTER TABLE "defect_records"
  ADD CONSTRAINT "defect_records_faction_response_check"
  CHECK ("faction_response" IN ('CONFIRMED', 'CONTESTED'));

-- ============================================================
-- T3 (AC3): notifications — faction_id FK
-- ============================================================
ALTER TABLE "notifications"
  ADD COLUMN "faction_id" UUID;

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_faction_id_fkey"
  FOREIGN KEY ("faction_id") REFERENCES "factions"("id");

-- Story 8.2: Add delivery code fields to faction_shipments
-- Run this migration against your Supabase database

ALTER TABLE faction_shipments
  ADD COLUMN IF NOT EXISTS delivery_code VARCHAR(6),
  ADD COLUMN IF NOT EXISTS delivery_code_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_code_attempts INT NOT NULL DEFAULT 0;

-- Index for fast uniqueness check on active delivery codes
CREATE INDEX IF NOT EXISTS idx_faction_shipments_delivery_code
  ON faction_shipments (delivery_code)
  WHERE delivery_code IS NOT NULL AND status IN ('PREPARING', 'SENT');

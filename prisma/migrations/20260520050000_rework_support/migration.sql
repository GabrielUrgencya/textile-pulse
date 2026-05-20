-- Story 3.3: Rework Support
-- Add IN_REWORK to LotStatus enum and previous_stage_id to defect_records

-- 1. Add IN_REWORK to LotStatus enum
ALTER TYPE "LotStatus" ADD VALUE IF NOT EXISTS 'IN_REWORK';

-- 2. Add previous_stage_id column to defect_records
ALTER TABLE "defect_records" ADD COLUMN IF NOT EXISTS "previous_stage_id" UUID REFERENCES "stages"("id");

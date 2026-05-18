-- Add gen_random_uuid() defaults to all id columns
-- Prisma schema uses @default(uuid()) but doesn't always generate the DB-level default

ALTER TABLE tenants ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE production_orders ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE stages ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE lots ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE scan_events ALTER COLUMN id SET DEFAULT gen_random_uuid();

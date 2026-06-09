-- Story 8.6: Add tenant_id to ops_clock (FALHA 5 fix)
ALTER TABLE ops_clock
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id),
  ADD COLUMN IF NOT EXISTS registered_by UUID REFERENCES profiles(id);

-- Backfill tenant_id from driver's tenant
UPDATE ops_clock oc
SET tenant_id = d.tenant_id
FROM drivers d
WHERE oc.driver_id = d.id AND oc.tenant_id IS NULL;

-- Make tenant_id NOT NULL after backfill
ALTER TABLE ops_clock ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ops_clock_tenant ON ops_clock (tenant_id);
CREATE INDEX IF NOT EXISTS idx_ops_clock_arrived ON ops_clock (arrived_at DESC);

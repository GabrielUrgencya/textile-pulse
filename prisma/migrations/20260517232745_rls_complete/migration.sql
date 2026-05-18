-- ============================================================
-- LISION — RLS Complete (Story 5.2, Architecture v2.1 Item 1)
-- Isolamento multi-tenant via Row-Level Security
-- ============================================================

-- ============================================================
-- 1. Helper function: auth_tenant_id()
-- Extrai tenant_id do JWT claim customizado do Supabase Auth
-- ============================================================
CREATE OR REPLACE FUNCTION public.auth_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::UUID,
    (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::UUID
  );
$$;

COMMENT ON FUNCTION public.auth_tenant_id() IS 'Extrai tenant_id do JWT (app_metadata ou user_metadata). Usado em todas as RLS policies para isolamento multi-tenant.';

-- ============================================================
-- 2. Enable RLS em TODAS as tabelas
-- ============================================================
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "production_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "scan_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "factions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "faction_shipments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "defect_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "drivers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "aduana_validations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "daily_metrics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ops_clock" ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. TENANTS — somente leitura do próprio tenant
-- ============================================================
CREATE POLICY "tenants_select" ON "tenants"
  FOR SELECT USING (id = auth_tenant_id());

-- ============================================================
-- 4. PROFILES — tenant direto
-- ============================================================
CREATE POLICY "profiles_select" ON "profiles"
  FOR SELECT USING (tenant_id = auth_tenant_id());

CREATE POLICY "profiles_insert" ON "profiles"
  FOR INSERT WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY "profiles_update" ON "profiles"
  FOR UPDATE USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());

-- ============================================================
-- 5. STAGES — tenant direto
-- ============================================================
CREATE POLICY "stages_select" ON "stages"
  FOR SELECT USING (tenant_id = auth_tenant_id());

CREATE POLICY "stages_insert" ON "stages"
  FOR INSERT WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY "stages_update" ON "stages"
  FOR UPDATE USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());

-- ============================================================
-- 6. PRODUCTION_ORDERS — tenant direto
-- ============================================================
CREATE POLICY "production_orders_select" ON "production_orders"
  FOR SELECT USING (tenant_id = auth_tenant_id());

CREATE POLICY "production_orders_insert" ON "production_orders"
  FOR INSERT WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY "production_orders_update" ON "production_orders"
  FOR UPDATE USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());

-- ============================================================
-- 7. LOTS — cadeia: lots → production_orders.tenant_id
-- ============================================================
CREATE POLICY "lots_select" ON "lots"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM production_orders po
      WHERE po.id = lots.po_id
        AND po.tenant_id = auth_tenant_id()
    )
  );

CREATE POLICY "lots_insert" ON "lots"
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM production_orders po
      WHERE po.id = po_id
        AND po.tenant_id = auth_tenant_id()
    )
  );

CREATE POLICY "lots_update" ON "lots"
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM production_orders po
      WHERE po.id = lots.po_id
        AND po.tenant_id = auth_tenant_id()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM production_orders po
      WHERE po.id = po_id
        AND po.tenant_id = auth_tenant_id()
    )
  );

-- ============================================================
-- 8. SCAN_EVENTS — cadeia completa (Item 1 v2.1 CRITICO)
-- scan_events → lots → production_orders.tenant_id
-- ============================================================
CREATE POLICY "scan_events_select" ON "scan_events"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM lots l
      JOIN production_orders po ON po.id = l.po_id
      WHERE l.id = scan_events.lot_id
        AND po.tenant_id = auth_tenant_id()
    )
  );

CREATE POLICY "scan_events_insert" ON "scan_events"
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM lots l
      JOIN production_orders po ON po.id = l.po_id
      WHERE l.id = lot_id
        AND po.tenant_id = auth_tenant_id()
    )
    AND user_id = auth.uid()
  );

CREATE POLICY "scan_events_update" ON "scan_events"
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM lots l
      JOIN production_orders po ON po.id = l.po_id
      WHERE l.id = scan_events.lot_id
        AND po.tenant_id = auth_tenant_id()
    )
  );

-- ============================================================
-- 9. FACTIONS — tenant direto
-- ============================================================
CREATE POLICY "factions_select" ON "factions"
  FOR SELECT USING (tenant_id = auth_tenant_id());

CREATE POLICY "factions_insert" ON "factions"
  FOR INSERT WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY "factions_update" ON "factions"
  FOR UPDATE USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());

-- ============================================================
-- 10. FACTION_SHIPMENTS — cadeia: faction_shipments → factions.tenant_id
-- ============================================================
CREATE POLICY "faction_shipments_select" ON "faction_shipments"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM factions f
      WHERE f.id = faction_shipments.faction_id
        AND f.tenant_id = auth_tenant_id()
    )
  );

CREATE POLICY "faction_shipments_insert" ON "faction_shipments"
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM factions f
      WHERE f.id = faction_id
        AND f.tenant_id = auth_tenant_id()
    )
  );

CREATE POLICY "faction_shipments_update" ON "faction_shipments"
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM factions f
      WHERE f.id = faction_shipments.faction_id
        AND f.tenant_id = auth_tenant_id()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM factions f
      WHERE f.id = faction_id
        AND f.tenant_id = auth_tenant_id()
    )
  );

-- ============================================================
-- 11. DEFECT_RECORDS — cadeia: defect_records → lots → production_orders.tenant_id
-- ============================================================
CREATE POLICY "defect_records_select" ON "defect_records"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM lots l
      JOIN production_orders po ON po.id = l.po_id
      WHERE l.id = defect_records.lot_id
        AND po.tenant_id = auth_tenant_id()
    )
  );

CREATE POLICY "defect_records_insert" ON "defect_records"
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM lots l
      JOIN production_orders po ON po.id = l.po_id
      WHERE l.id = lot_id
        AND po.tenant_id = auth_tenant_id()
    )
    AND detected_by = auth.uid()
  );

CREATE POLICY "defect_records_update" ON "defect_records"
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM lots l
      JOIN production_orders po ON po.id = l.po_id
      WHERE l.id = defect_records.lot_id
        AND po.tenant_id = auth_tenant_id()
    )
  );

-- ============================================================
-- 12. DRIVERS — tenant direto
-- ============================================================
CREATE POLICY "drivers_select" ON "drivers"
  FOR SELECT USING (tenant_id = auth_tenant_id());

CREATE POLICY "drivers_insert" ON "drivers"
  FOR INSERT WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY "drivers_update" ON "drivers"
  FOR UPDATE USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());

-- ============================================================
-- 13. ADUANA_VALIDATIONS — cadeia: aduana_validations → lots → production_orders.tenant_id
-- ============================================================
CREATE POLICY "aduana_validations_select" ON "aduana_validations"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM lots l
      JOIN production_orders po ON po.id = l.po_id
      WHERE l.id = aduana_validations.lot_id
        AND po.tenant_id = auth_tenant_id()
    )
  );

CREATE POLICY "aduana_validations_insert" ON "aduana_validations"
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM lots l
      JOIN production_orders po ON po.id = l.po_id
      WHERE l.id = lot_id
        AND po.tenant_id = auth_tenant_id()
    )
    AND scanned_by = auth.uid()
  );

-- ============================================================
-- 14. DAILY_METRICS — tenant direto
-- ============================================================
CREATE POLICY "daily_metrics_select" ON "daily_metrics"
  FOR SELECT USING (tenant_id = auth_tenant_id());

CREATE POLICY "daily_metrics_insert" ON "daily_metrics"
  FOR INSERT WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY "daily_metrics_update" ON "daily_metrics"
  FOR UPDATE USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());

-- ============================================================
-- 15. NOTIFICATIONS — tenant + user_id
-- ============================================================
CREATE POLICY "notifications_select" ON "notifications"
  FOR SELECT USING (
    tenant_id = auth_tenant_id()
    AND (user_id = auth.uid() OR user_id IS NULL)
  );

CREATE POLICY "notifications_insert" ON "notifications"
  FOR INSERT WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY "notifications_update" ON "notifications"
  FOR UPDATE USING (
    tenant_id = auth_tenant_id()
    AND (user_id = auth.uid() OR user_id IS NULL)
  );

-- ============================================================
-- 16. AUDIT_LOG — tenant direto (somente leitura para não-admin)
-- ============================================================
CREATE POLICY "audit_log_select" ON "audit_log"
  FOR SELECT USING (tenant_id = auth_tenant_id());

CREATE POLICY "audit_log_insert" ON "audit_log"
  FOR INSERT WITH CHECK (tenant_id = auth_tenant_id());

-- ============================================================
-- 17. OPS_CLOCK — cadeia: ops_clock → drivers.tenant_id
-- ============================================================
CREATE POLICY "ops_clock_select" ON "ops_clock"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM drivers d
      WHERE d.id = ops_clock.driver_id
        AND d.tenant_id = auth_tenant_id()
    )
  );

CREATE POLICY "ops_clock_insert" ON "ops_clock"
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM drivers d
      WHERE d.id = driver_id
        AND d.tenant_id = auth_tenant_id()
    )
  );

CREATE POLICY "ops_clock_update" ON "ops_clock"
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM drivers d
      WHERE d.id = ops_clock.driver_id
        AND d.tenant_id = auth_tenant_id()
    )
  );

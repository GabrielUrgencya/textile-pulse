-- Épico "Dashboards 2.0" — config visual de KPIs da TV por setor (Story 8.38).
-- 1 config por (tenant, stage). `layout` = array JSON de widgets (shape validado na app).
-- ADITIVA. Idempotente. RLS tenant-scoped via auth_tenant_id() (padrão do projeto).

CREATE TABLE IF NOT EXISTS "public"."sector_dashboard_configs" (
  "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"  UUID        NOT NULL,
  "stage_id"   UUID        NOT NULL,
  "layout"     JSONB       NOT NULL DEFAULT '[]'::jsonb,
  "updated_by" UUID,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sector_dashboard_configs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sector_dashboard_configs_unique" UNIQUE ("tenant_id", "stage_id"),
  CONSTRAINT "sector_dashboard_configs_tenant_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "public"."tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "sector_dashboard_configs_stage_fkey" FOREIGN KEY ("stage_id")
    REFERENCES "public"."stages"("id") ON DELETE CASCADE,
  CONSTRAINT "sector_dashboard_configs_updated_by_fkey" FOREIGN KEY ("updated_by")
    REFERENCES "public"."profiles"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_sdc_tenant" ON "public"."sector_dashboard_configs"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_sdc_tenant_stage" ON "public"."sector_dashboard_configs"("tenant_id", "stage_id");

COMMENT ON TABLE "public"."sector_dashboard_configs" IS 'Dashboards 2.0: layout de KPIs (widgets) da TV por setor (= stage). layout = JSONB array de KPIWidget.';
COMMENT ON COLUMN "public"."sector_dashboard_configs"."layout" IS 'Array JSON de widgets: { id, type, metric, label, size, position{x,y}, thresholds?{warning,critical} }. Shape validado na app.';

-- ============================================================
-- RLS — tenant-scoped (escrita = admin sob sessão; leitura TV via service_role/kiosk)
-- ============================================================
ALTER TABLE "public"."sector_dashboard_configs" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sdc_select" ON "public"."sector_dashboard_configs";
CREATE POLICY "sdc_select" ON "public"."sector_dashboard_configs" FOR SELECT USING (tenant_id = auth_tenant_id());
DROP POLICY IF EXISTS "sdc_insert" ON "public"."sector_dashboard_configs";
CREATE POLICY "sdc_insert" ON "public"."sector_dashboard_configs" FOR INSERT WITH CHECK (tenant_id = auth_tenant_id());
DROP POLICY IF EXISTS "sdc_update" ON "public"."sector_dashboard_configs";
CREATE POLICY "sdc_update" ON "public"."sector_dashboard_configs" FOR UPDATE USING (tenant_id = auth_tenant_id()) WITH CHECK (tenant_id = auth_tenant_id());
DROP POLICY IF EXISTS "sdc_delete" ON "public"."sector_dashboard_configs";
CREATE POLICY "sdc_delete" ON "public"."sector_dashboard_configs" FOR DELETE USING (tenant_id = auth_tenant_id());

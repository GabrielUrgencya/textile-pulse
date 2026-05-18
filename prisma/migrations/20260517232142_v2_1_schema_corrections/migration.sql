-- CreateEnum
CREATE TYPE "LotStatus" AS ENUM ('CREATED', 'IN_CUT', 'IN_TRIMS', 'IN_PRODUCTION', 'AT_FACTION', 'IN_FINISHING', 'IN_CLEANING', 'IN_QUALITY', 'IN_PACKING', 'IN_STOCK', 'PARTIALLY_STOCKED');

-- CreateEnum
CREATE TYPE "ScanEventType" AS ENUM ('STAGE_IN', 'STAGE_OUT', 'FACTION_SEND', 'FACTION_RECEIVE', 'FACTION_RETURN', 'DEFECT_DETECTED', 'REWORK_COMPLETE', 'ADUANA_CHECK', 'STOCK_ENTRY', 'DISCARD');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'GERENTE', 'COORDENADOR', 'OPERADOR', 'FACCAO');

-- CreateEnum
CREATE TYPE "AlertColor" AS ENUM ('GREEN', 'AMBER', 'RED');

-- CreateEnum
CREATE TYPE "DefectType" AS ENUM ('COSTURA', 'TECIDO', 'AVIAMENTO', 'OUTRO');

-- CreateEnum
CREATE TYPE "DefectSeverity" AS ENUM ('LEVE', 'MEDIO', 'GRAVE');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('PREPARING', 'SENT', 'RECEIVED_BY_FACTION', 'PARTIALLY_RETURNED', 'RETURNED', 'OVERDUE');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo_url" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{"allowance_target":0.002,"daily_target":500,"weekly_target":2500,"monthly_target":20000,"currency":"BRL","timezone":"America/Sao_Paulo","work_hours_per_day":8,"work_days_per_week":5.5}',
    "subscription_plan" TEXT NOT NULL DEFAULT 'pilot',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'OPERADOR',
    "sector" TEXT,
    "pin_code" TEXT,
    "avatar_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "is_mandatory" BOOLEAN NOT NULL DEFAULT true,
    "expected_duration_hours" DECIMAL(6,2),
    "color" TEXT,
    "icon" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_orders" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "op_number" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "reference" TEXT,
    "description" TEXT,
    "total_quantity" INTEGER NOT NULL,
    "meta_coefficient" DECIMAL(4,2) NOT NULL DEFAULT 1.0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "erp_reference" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "production_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lots" (
    "id" UUID NOT NULL,
    "po_id" UUID NOT NULL,
    "barcode" TEXT NOT NULL,
    "lot_number" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "quantity_ok" INTEGER NOT NULL DEFAULT 0,
    "quantity_defect" INTEGER NOT NULL DEFAULT 0,
    "quantity_stocked" INTEGER NOT NULL DEFAULT 0,
    "quantity_discarded" INTEGER NOT NULL DEFAULT 0,
    "current_stage_id" UUID,
    "status" "LotStatus" NOT NULL DEFAULT 'CREATED',
    "destination" TEXT,
    "current_holder_id" UUID,
    "entered_current_stage_at" TIMESTAMPTZ,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_events" (
    "id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "stage_id" UUID,
    "user_id" UUID NOT NULL,
    "event_type" "ScanEventType" NOT NULL,
    "scanned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quantity_scanned" INTEGER,
    "quantity_ok" INTEGER,
    "quantity_defect" INTEGER,
    "device_info" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "is_offline_sync" BOOLEAN NOT NULL DEFAULT false,
    "offline_scanned_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scan_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "factions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "contact_name" TEXT,
    "contact_phone" TEXT,
    "address" TEXT,
    "price_per_piece" DECIMAL(10,2),
    "avg_delivery_days" INTEGER NOT NULL DEFAULT 7,
    "rating" DECIMAL(3,1) NOT NULL DEFAULT 5.0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "factions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faction_shipments" (
    "id" UUID NOT NULL,
    "faction_id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "driver_id" UUID,
    "quantity_sent" INTEGER NOT NULL,
    "quantity_returned" INTEGER NOT NULL DEFAULT 0,
    "quantity_defective" INTEGER NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expected_return_at" TIMESTAMPTZ NOT NULL,
    "actual_return_at" TIMESTAMPTZ,
    "sent_by" UUID,
    "received_by" UUID,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'PREPARING',
    "payment_value" DECIMAL(10,2),
    "deduction_value" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "faction_shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "defect_records" (
    "id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "shipment_id" UUID,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "defect_type" "DefectType" NOT NULL,
    "severity" "DefectSeverity" NOT NULL,
    "description" TEXT,
    "photo_url" TEXT,
    "detected_by" UUID NOT NULL,
    "detected_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_by" UUID,
    "resolved_at" TIMESTAMPTZ,
    "resolved_quantity" INTEGER NOT NULL DEFAULT 0,
    "discarded_quantity" INTEGER NOT NULL DEFAULT 0,
    "resolution" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "defect_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "vehicle_plate" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aduana_validations" (
    "id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "shipment_id" UUID,
    "driver_id" UUID,
    "scanned_by" UUID NOT NULL,
    "alert_color" "AlertColor" NOT NULL,
    "alert_reason" TEXT,
    "alert_ignored" BOOLEAN NOT NULL DEFAULT false,
    "ignore_reason" TEXT,
    "scanned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aduana_validations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_metrics" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "total_produced" INTEGER NOT NULL DEFAULT 0,
    "total_stocked" INTEGER NOT NULL DEFAULT 0,
    "total_defects" INTEGER NOT NULL DEFAULT 0,
    "total_lost" INTEGER NOT NULL DEFAULT 0,
    "allowance_rate" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "target_met" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "top_producers" JSONB NOT NULL DEFAULT '[]',
    "stage_times" JSONB NOT NULL DEFAULT '{}',
    "faction_summary" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "daily_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID,
    "target_role" "UserRole",
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "read_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "ip_address" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ops_clock" (
    "id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "arrived_at" TIMESTAMPTZ NOT NULL,
    "loading_started_at" TIMESTAMPTZ,
    "loading_ended_at" TIMESTAMPTZ,
    "departed_at" TIMESTAMPTZ,

    CONSTRAINT "ops_clock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "stages_tenant_id_order_index_key" ON "stages"("tenant_id", "order_index");

-- CreateIndex
CREATE UNIQUE INDEX "production_orders_tenant_id_op_number_key" ON "production_orders"("tenant_id", "op_number");

-- CreateIndex
CREATE UNIQUE INDEX "lots_barcode_key" ON "lots"("barcode");

-- CreateIndex
CREATE INDEX "lots_barcode_idx" ON "lots"("barcode");

-- CreateIndex
CREATE INDEX "lots_status_idx" ON "lots"("status");

-- CreateIndex
CREATE INDEX "lots_current_stage_id_idx" ON "lots"("current_stage_id");

-- CreateIndex
CREATE UNIQUE INDEX "lots_po_id_lot_number_key" ON "lots"("po_id", "lot_number");

-- CreateIndex
CREATE INDEX "scan_events_lot_id_idx" ON "scan_events"("lot_id");

-- CreateIndex
CREATE INDEX "scan_events_scanned_at_idx" ON "scan_events"("scanned_at");

-- CreateIndex
CREATE INDEX "scan_events_user_id_idx" ON "scan_events"("user_id");

-- CreateIndex
CREATE INDEX "scan_events_event_type_idx" ON "scan_events"("event_type");

-- CreateIndex
CREATE UNIQUE INDEX "daily_metrics_tenant_id_date_key" ON "daily_metrics"("tenant_id", "date");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stages" ADD CONSTRAINT "stages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "production_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_current_stage_id_fkey" FOREIGN KEY ("current_stage_id") REFERENCES "stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_current_holder_id_fkey" FOREIGN KEY ("current_holder_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_events" ADD CONSTRAINT "scan_events_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_events" ADD CONSTRAINT "scan_events_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_events" ADD CONSTRAINT "scan_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factions" ADD CONSTRAINT "factions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faction_shipments" ADD CONSTRAINT "faction_shipments_faction_id_fkey" FOREIGN KEY ("faction_id") REFERENCES "factions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faction_shipments" ADD CONSTRAINT "faction_shipments_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faction_shipments" ADD CONSTRAINT "faction_shipments_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faction_shipments" ADD CONSTRAINT "faction_shipments_sent_by_fkey" FOREIGN KEY ("sent_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faction_shipments" ADD CONSTRAINT "faction_shipments_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_records" ADD CONSTRAINT "defect_records_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_records" ADD CONSTRAINT "defect_records_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "faction_shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_records" ADD CONSTRAINT "defect_records_detected_by_fkey" FOREIGN KEY ("detected_by") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_records" ADD CONSTRAINT "defect_records_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aduana_validations" ADD CONSTRAINT "aduana_validations_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aduana_validations" ADD CONSTRAINT "aduana_validations_scanned_by_fkey" FOREIGN KEY ("scanned_by") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_metrics" ADD CONSTRAINT "daily_metrics_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops_clock" ADD CONSTRAINT "ops_clock_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK constraint: barcode format OP-YYYYMMDD-NNN-LNNN (Item 12 v2.1)
ALTER TABLE "lots" ADD CONSTRAINT "chk_barcode_format"
  CHECK (barcode ~ '^OP-[0-9]{8}-[0-9]{3}-L[0-9]{3}$');

-- COMMENT ON: documentação inline para campos críticos
COMMENT ON COLUMN "production_orders"."meta_coefficient" IS 'Snapshot de reference_targets.meta_coefficient na criação da OP (Item 13 v2.1). Fonte da verdade em reference_targets.';
COMMENT ON TABLE "tenants" IS 'Tenants do sistema. deleted_at para soft delete LGPD (Item 17 v2.1).';
COMMENT ON TABLE "profiles" IS 'Perfis de usuários. deleted_at para soft delete LGPD (Item 17 v2.1).';

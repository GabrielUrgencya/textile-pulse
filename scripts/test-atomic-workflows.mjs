import { readFile } from "node:fs/promises";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const [createMigration, reconciliationMigration, shipmentRoute, holdRoute, finalizeRoute, userReset, sectorReset] = await Promise.all([
  readFile("prisma/migrations/20260805164000_atomic_grouped_shipment_creation/migration.sql", "utf8"),
  readFile("prisma/migrations/20260805162000_atomic_shipment_reconciliation/migration.sql", "utf8"),
  readFile("src/app/api/shipments/route.ts", "utf8"),
  readFile("src/app/api/shipments/[id]/hold-inspection/route.ts", "utf8"),
  readFile("src/app/api/shipments/[id]/finalize-inspection/route.ts", "utf8"),
  readFile("src/app/api/my-plan/reset-goal/route.ts", "utf8"),
  readFile("src/app/api/settings/sector-targets/reset/route.ts", "utf8"),
]);

assert(createMigration.includes("create_faction_shipments_atomic_v1") && createMigration.includes("INSERT INTO audit_log"), "Creation RPC must atomically audit shipments");
assert(createMigration.includes("pg_advisory_xact_lock") && createMigration.includes("LOT_ALREADY_IN_ACTIVE_SHIPMENT"), "Creation RPC must serialize overlapping lot requests");
assert(reconciliationMigration.includes("reconcile_shipment_return_v1") && reconciliationMigration.includes("idempotency_key"), "Reconciliation RPC must make ledger credits idempotent");
assert(reconciliationMigration.includes("hold_shipment_inspection_v1") && reconciliationMigration.includes("INSERT INTO audit_log"), "Inspection hold must transition and audit atomically");
assert(shipmentRoute.includes('rpc("create_faction_shipments_atomic_v1"'), "Shipment endpoint must call atomic creation");
assert(holdRoute.includes('rpc("hold_shipment_inspection_v1"'), "Hold endpoint must call atomic transition");
assert(finalizeRoute.includes('rpc("reconcile_shipment_return_v1"'), "Finalize endpoint must call atomic reconciliation");
assert(userReset.includes('rpc("reset_goal_debts_atomic_v1"') && sectorReset.includes('rpc("reset_goal_debts_atomic_v1"'), "Both reset endpoints must call the same atomic debt reset");

console.log("PASS: atomic shipment, inspection, audit, concurrency and debt-reset integrations are wired to their RPC contracts.");

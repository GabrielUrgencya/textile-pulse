import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const TENANT_ID = "588a3542-d6db-4fc4-bd98-3dcde56bdb6b";
const OPERADOR_ID = "00000000-0000-0000-0000-000000000002";
const ADMIN_ID = "00000000-0000-0000-0000-000000000001";
const GERENTE_ID = "00000000-0000-0000-0000-000000000003";
const FACTION_ID = "80a634da-a417-4042-8d3a-1843074b7680";
const STAGES = {
  CORTE: "9614ad2d-b3d1-46ee-a72a-b3e58e549d33",
  AVIAMENTOS: "1131c955-a988-4d76-8e3c-d24638b783fc",
  PRODUCAO: "3dfcaa85-05c1-4d30-ad40-263021aad65f",
  TRAVETE: "4fdea089-b82c-4d64-8469-ac476bcc707f",
  LIMPEZA: "510fc774-d1d2-44c4-aff1-4c9619920751",
  CONFERENCIA: "3a2540e1-5cb9-4146-8898-f82dd3c55d2c",
  EMBALAGEM: "143a7cd0-dca5-4407-b290-e16de1345afa",
  ESTOQUE: "78ac5ad6-0574-4347-9553-171840a30722",
};

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

async function main() {
  console.log("=== Fixing failed seed items ===\n");

  // 1. Create lot L004 (IN_REWORK)
  console.log("1. Creating rework lot...");
  const { error: lotErr } = await sb.from("lots").upsert({
    id: "b0000000-0000-0000-0000-000000000006",
    po_id: "a0000000-0000-0000-0000-000000000001",
    barcode: "OP-20260520-002-L004",
    lot_number: "L004",
    quantity: 50,
    quantity_defect: 8,
    status: "IN_REWORK",
    current_stage_id: STAGES.CONFERENCIA,
    destination: "INTERNAL",
    created_by: ADMIN_ID,
  }, { onConflict: "id" });
  console.log("  Lot L004:", lotErr ? lotErr.message : "OK");

  // 2. Create scan events
  console.log("\n2. Creating scan events...");
  const scanEvents = [
    { lot_id: "b0000000-0000-0000-0000-000000000001", stage_id: STAGES.CORTE, user_id: OPERADOR_ID, event_type: "STAGE_IN", scanned_at: daysAgo(10), metadata: {} },
    { lot_id: "b0000000-0000-0000-0000-000000000001", stage_id: STAGES.AVIAMENTOS, user_id: OPERADOR_ID, event_type: "STAGE_IN", scanned_at: daysAgo(9), metadata: {} },
    { lot_id: "b0000000-0000-0000-0000-000000000001", stage_id: STAGES.PRODUCAO, user_id: OPERADOR_ID, event_type: "STAGE_IN", scanned_at: daysAgo(7), metadata: {} },
    { lot_id: "b0000000-0000-0000-0000-000000000002", stage_id: STAGES.CORTE, user_id: OPERADOR_ID, event_type: "STAGE_IN", scanned_at: daysAgo(12), metadata: {} },
    { lot_id: "b0000000-0000-0000-0000-000000000002", stage_id: STAGES.AVIAMENTOS, user_id: OPERADOR_ID, event_type: "STAGE_IN", scanned_at: daysAgo(11), metadata: {} },
    { lot_id: "b0000000-0000-0000-0000-000000000002", stage_id: STAGES.PRODUCAO, user_id: OPERADOR_ID, event_type: "STAGE_IN", scanned_at: daysAgo(8), metadata: {} },
    { lot_id: "b0000000-0000-0000-0000-000000000002", stage_id: STAGES.TRAVETE, user_id: OPERADOR_ID, event_type: "STAGE_IN", scanned_at: daysAgo(3), metadata: {} },
    { lot_id: "b0000000-0000-0000-0000-000000000003", stage_id: STAGES.CORTE, user_id: OPERADOR_ID, event_type: "STAGE_IN", scanned_at: daysAgo(15), metadata: {} },
    { lot_id: "b0000000-0000-0000-0000-000000000003", stage_id: STAGES.AVIAMENTOS, user_id: OPERADOR_ID, event_type: "STAGE_IN", scanned_at: daysAgo(14), metadata: {} },
    { lot_id: "b0000000-0000-0000-0000-000000000003", stage_id: STAGES.PRODUCAO, user_id: OPERADOR_ID, event_type: "FACTION_SEND", scanned_at: daysAgo(12), metadata: {} },
    { lot_id: "b0000000-0000-0000-0000-000000000004", stage_id: STAGES.CORTE, user_id: OPERADOR_ID, event_type: "STAGE_IN", scanned_at: daysAgo(30), metadata: {} },
    { lot_id: "b0000000-0000-0000-0000-000000000004", stage_id: STAGES.AVIAMENTOS, user_id: OPERADOR_ID, event_type: "STAGE_IN", scanned_at: daysAgo(29), metadata: {} },
    { lot_id: "b0000000-0000-0000-0000-000000000004", stage_id: STAGES.PRODUCAO, user_id: OPERADOR_ID, event_type: "STAGE_IN", scanned_at: daysAgo(27), metadata: {} },
    { lot_id: "b0000000-0000-0000-0000-000000000004", stage_id: STAGES.TRAVETE, user_id: OPERADOR_ID, event_type: "STAGE_IN", scanned_at: daysAgo(22), metadata: {} },
    { lot_id: "b0000000-0000-0000-0000-000000000004", stage_id: STAGES.LIMPEZA, user_id: OPERADOR_ID, event_type: "STAGE_IN", scanned_at: daysAgo(21), metadata: {} },
    { lot_id: "b0000000-0000-0000-0000-000000000004", stage_id: STAGES.CONFERENCIA, user_id: OPERADOR_ID, event_type: "STAGE_IN", scanned_at: daysAgo(20), metadata: {} },
    { lot_id: "b0000000-0000-0000-0000-000000000004", stage_id: STAGES.EMBALAGEM, user_id: OPERADOR_ID, event_type: "STAGE_IN", scanned_at: daysAgo(19), metadata: {} },
    { lot_id: "b0000000-0000-0000-0000-000000000004", stage_id: STAGES.ESTOQUE, user_id: OPERADOR_ID, event_type: "STOCK_ENTRY", scanned_at: daysAgo(18), metadata: {} },
    { lot_id: "b0000000-0000-0000-0000-000000000006", stage_id: STAGES.CONFERENCIA, user_id: OPERADOR_ID, event_type: "DEFECT_DETECTED", scanned_at: daysAgo(2), metadata: {} },
  ];
  const { error: scanErr, data: scanData } = await sb.from("scan_events").insert(scanEvents).select("id");
  console.log("  Scan events:", scanErr ? scanErr.message : `${scanData.length} created`);

  // 3. Create defect records
  console.log("\n3. Creating defect records...");
  const defects = [
    { lot_id: "b0000000-0000-0000-0000-000000000006", quantity: 5, defect_type: "COSTURA", severity: "MEDIO", description: "Costuras desalinhadas na manga esquerda", detected_by: OPERADOR_ID, detected_at: daysAgo(2), status: "PENDING", previous_stage_id: STAGES.CONFERENCIA },
    { lot_id: "b0000000-0000-0000-0000-000000000006", quantity: 3, defect_type: "TECIDO", severity: "GRAVE", description: "Tecido rasgado na parte frontal", detected_by: OPERADOR_ID, detected_at: daysAgo(2), status: "PENDING", previous_stage_id: STAGES.CONFERENCIA },
    { lot_id: "b0000000-0000-0000-0000-000000000004", shipment_id: "c0000000-0000-0000-0000-000000000003", quantity: 5, defect_type: "COSTURA", severity: "LEVE", description: "Acabamento irregular nas laterais", detected_by: GERENTE_ID, detected_at: daysAgo(20), resolved_by: OPERADOR_ID, resolved_at: daysAgo(18), resolved_quantity: 4, discarded_quantity: 1, resolution: "4 pecas corrigidas, 1 descartada", status: "RESOLVED", previous_stage_id: STAGES.TRAVETE, faction_response: "Problema no lote de linha, ja corrigido", faction_response_at: daysAgo(19) },
    { lot_id: "b0000000-0000-0000-0000-000000000003", shipment_id: "c0000000-0000-0000-0000-000000000001", quantity: 8, defect_type: "AVIAMENTO", severity: "MEDIO", description: "Botoes soltos em 8 pecas", detected_by: ADMIN_ID, detected_at: daysAgo(4), status: "PENDING", contestation_reason: "Botoes ja estavam soltos antes do envio" },
    { lot_id: "b0000000-0000-0000-0000-000000000005", quantity: 2, defect_type: "OUTRO", severity: "LEVE", description: "Mancha leve de tinta na etiqueta", detected_by: OPERADOR_ID, detected_at: daysAgo(15), resolved_by: OPERADOR_ID, resolved_at: daysAgo(14), resolved_quantity: 2, discarded_quantity: 0, resolution: "Etiquetas refeitas", status: "RESOLVED" },
  ];
  const { error: defErr, data: defData } = await sb.from("defect_records").insert(defects).select("id");
  console.log("  Defects:", defErr ? defErr.message : `${defData.length} created`);

  // 4. Create faction token
  console.log("\n4. Creating faction token...");
  const testPinHash = await bcrypt.hash("999999", 10);
  const { error: ftErr } = await sb.from("faction_tokens").upsert({
    id: "f0000000-0000-0000-0000-000000000001",
    tenant_id: TENANT_ID,
    faction_id: FACTION_ID,
    token: "f0000000-aaaa-bbbb-cccc-000000000001",
    pin_hash: testPinHash,
    name: "Token Teste QA",
    is_active: true,
  }, { onConflict: "id" });
  console.log("  Faction token:", ftErr ? ftErr.message : "OK");

  // 5. Final counts
  console.log("\n=== Final Data Counts ===");
  const tables = ["profiles", "stages", "production_orders", "lots", "scan_events", "factions", "faction_shipments", "defect_records", "drivers", "notifications", "daily_metrics", "kiosk_tokens", "faction_tokens"];
  for (const t of tables) {
    const { count } = await sb.from(t).select("*", { count: "exact", head: true });
    console.log(`  ${t}: ${count}`);
  }
}

main().catch(console.error);

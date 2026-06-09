/**
 * LISION — Comprehensive Test Seed
 *
 * Populates the database with realistic test data for full platform testing.
 * Uses Supabase Admin client (service_role) to bypass RLS.
 *
 * Run: npx tsx scripts/test-seed.ts
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const TENANT_ID = "588a3542-d6db-4fc4-bd98-3dcde56bdb6b";

// Stage IDs from existing DB
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

// Existing user IDs
const ADMIN_ID = "00000000-0000-0000-0000-000000000001";
const OPERADOR_ID = "00000000-0000-0000-0000-000000000002";

// New users to create
const GERENTE_ID = "00000000-0000-0000-0000-000000000003";
const COORDENADOR_ID = "00000000-0000-0000-0000-000000000004";

// Existing faction
const FACTION_ID = "80a634da-a417-4042-8d3a-1843074b7680";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

function dateOnly(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().split("T")[0];
}

async function createAuthUser(id: string, email: string, role: string) {
  // Check if user already exists
  const { data: existing } = await sb.auth.admin.getUserById(id);
  if (existing?.user) {
    console.log(`  Auth user ${email} already exists, updating metadata...`);
    await sb.auth.admin.updateUserById(id, {
      app_metadata: {
        provider: "email",
        providers: ["email"],
        role,
        tenant_id: TENANT_ID,
      },
    });
    return;
  }

  const { error } = await sb.auth.admin.createUser({
    id,
    email,
    password: "Test@1234",
    email_confirm: true,
    app_metadata: {
      provider: "email",
      providers: ["email"],
      role,
      tenant_id: TENANT_ID,
    },
  });

  if (error) {
    console.error(`  Failed to create auth user ${email}:`, error.message);
  } else {
    console.log(`  Created auth user: ${email} (${role})`);
  }
}

async function main() {
  console.log("=== LISION Test Seed ===\n");

  // ─── 1. Create missing auth users (GERENTE, COORDENADOR) ───
  console.log("1. Creating auth users...");
  await createAuthUser(GERENTE_ID, "gerente@liserie.com.br", "GERENTE");
  await createAuthUser(COORDENADOR_ID, "coordenador@liserie.com.br", "COORDENADOR");

  // ─── 2. Create profiles for new users ───
  console.log("\n2. Creating profiles...");
  const gerentePin = await bcrypt.hash("1111", 10);
  const coordenadorPin = await bcrypt.hash("2222", 10);

  for (const profile of [
    {
      id: GERENTE_ID,
      tenant_id: TENANT_ID,
      full_name: "Marcos Gerente",
      email: "gerente@liserie.com.br",
      role: "GERENTE",
      sector: "PRODUCAO",
      pin_code: gerentePin,
      is_active: true,
    },
    {
      id: COORDENADOR_ID,
      tenant_id: TENANT_ID,
      full_name: "Ana Coordenadora",
      email: "coordenador@liserie.com.br",
      role: "COORDENADOR",
      sector: "QUALIDADE",
      pin_code: coordenadorPin,
      is_active: true,
    },
  ]) {
    const { error } = await sb.from("profiles").upsert(profile, { onConflict: "id" });
    if (error) console.error(`  Profile ${profile.full_name}:`, error.message);
    else console.log(`  Profile: ${profile.full_name} (${profile.role}, PIN: ${profile.role === "GERENTE" ? "1111" : "2222"})`);
  }

  // ─── 3. Create second faction ───
  console.log("\n3. Creating second faction...");
  const FACTION2_ID = "80a634da-a417-4042-8d3a-1843074b7681";
  const { error: f2Err } = await sb.from("factions").upsert({
    id: FACTION2_ID,
    tenant_id: TENANT_ID,
    name: "Maria Costura",
    type: "COSTURA",
    contact_name: "Maria Silva",
    contact_phone: "(11) 99876-5432",
    address: "Rua das Costureiras, 456 - SP",
    price_per_piece: 45.00,
    avg_delivery_days: 5,
    rating: 4.2,
    is_active: true,
  }, { onConflict: "id" });
  if (f2Err) console.error("  Faction 2:", f2Err.message);
  else console.log("  Faction: Maria Costura (R$45/peça)");

  // ─── 4. Create driver ───
  console.log("\n4. Creating driver...");
  const DRIVER_ID = "d0000000-0000-0000-0000-000000000001";
  const { error: drvErr } = await sb.from("drivers").upsert({
    id: DRIVER_ID,
    tenant_id: TENANT_ID,
    name: "João Motorista",
    phone: "(11) 98765-4321",
    vehicle_plate: "ABC-1D23",
    is_active: true,
  }, { onConflict: "id" });
  if (drvErr) console.error("  Driver:", drvErr.message);
  else console.log("  Driver: João Motorista (ABC-1D23)");

  // ─── 5. Create additional production order (IN_PROGRESS) ───
  console.log("\n5. Creating production orders...");
  const PO_PROGRESS_ID = "a0000000-0000-0000-0000-000000000001";
  const PO_COMPLETED_ID = "a0000000-0000-0000-0000-000000000002";

  for (const po of [
    {
      id: PO_PROGRESS_ID,
      tenant_id: TENANT_ID,
      op_number: "OP-20260520-002",
      product_name: "Blusa Floral Verão",
      reference: "BFV-002",
      description: "Blusa feminina estampa floral, coleção verão 2026",
      total_quantity: 300,
      meta_coefficient: 1.15,
      status: "IN_PROGRESS",
      priority: 1,
      created_by: ADMIN_ID,
    },
    {
      id: PO_COMPLETED_ID,
      tenant_id: TENANT_ID,
      op_number: "OP-20260410-003",
      product_name: "Calça Jeans Slim",
      reference: "CJS-003",
      description: "Calça jeans feminina modelo slim fit",
      total_quantity: 200,
      meta_coefficient: 1.3,
      status: "COMPLETED",
      priority: 0,
      created_by: ADMIN_ID,
    },
  ]) {
    const { error } = await sb.from("production_orders").upsert(po, { onConflict: "id" });
    if (error) console.error(`  PO ${po.op_number}:`, error.message);
    else console.log(`  PO: ${po.op_number} — ${po.product_name} (${po.status})`);
  }

  // ─── 6. Create lots for the new OPs with varied statuses ───
  console.log("\n6. Creating test lots...");
  const newLots = [
    // OP IN_PROGRESS — lots in various stages
    { id: "b0000000-0000-0000-0000-000000000001", po_id: PO_PROGRESS_ID, barcode: "OP-20260520-002-L001", lot_number: "L001", quantity: 100, status: "IN_PRODUCTION", current_stage_id: STAGES.PRODUCAO, destination: "FACTION", created_by: ADMIN_ID },
    { id: "b0000000-0000-0000-0000-000000000002", po_id: PO_PROGRESS_ID, barcode: "OP-20260520-002-L002", lot_number: "L002", quantity: 100, status: "IN_FINISHING", current_stage_id: STAGES.TRAVETE, destination: "INTERNAL", created_by: ADMIN_ID },
    { id: "b0000000-0000-0000-0000-000000000003", po_id: PO_PROGRESS_ID, barcode: "OP-20260520-002-L003", lot_number: "L003", quantity: 100, status: "AT_FACTION", current_stage_id: STAGES.PRODUCAO, destination: "FACTION", created_by: ADMIN_ID },
    // OP COMPLETED — lots in stock or rework
    { id: "b0000000-0000-0000-0000-000000000004", po_id: PO_COMPLETED_ID, barcode: "OP-20260410-003-L001", lot_number: "L001", quantity: 100, quantity_ok: 95, quantity_defect: 5, status: "IN_STOCK", current_stage_id: STAGES.ESTOQUE, destination: "INTERNAL", created_by: ADMIN_ID },
    { id: "b0000000-0000-0000-0000-000000000005", po_id: PO_COMPLETED_ID, barcode: "OP-20260410-003-L002", lot_number: "L002", quantity: 100, quantity_ok: 88, quantity_defect: 12, quantity_stocked: 88, status: "IN_STOCK", current_stage_id: STAGES.ESTOQUE, destination: "INTERNAL", created_by: ADMIN_ID },
    // A lot in rework
    { id: "b0000000-0000-0000-0000-000000000006", po_id: PO_PROGRESS_ID, barcode: "OP-20260520-002-L004", lot_number: "L004", quantity: 50, quantity_defect: 8, status: "IN_REWORK", current_stage_id: STAGES.CONFERENCIA, destination: "INTERNAL", created_by: ADMIN_ID },
  ];

  for (const lot of newLots) {
    const { error } = await sb.from("lots").upsert(lot, { onConflict: "id" });
    if (error) console.error(`  Lot ${lot.barcode}:`, error.message);
    else console.log(`  Lot: ${lot.barcode} (${lot.status}, ${lot.quantity} pcs)`);
  }

  // ─── 7. Create scan events for the lots ───
  console.log("\n7. Creating scan events...");
  const scanEvents = [
    // Lot L001 (OP-002): CORTE → AVIAMENTOS → PRODUCAO
    { lot_id: "b0000000-0000-0000-0000-000000000001", stage_id: STAGES.CORTE, user_id: OPERADOR_ID, event_type: "STAGE_IN", scanned_at: daysAgo(10), metadata: {} },
    { lot_id: "b0000000-0000-0000-0000-000000000001", stage_id: STAGES.AVIAMENTOS, user_id: OPERADOR_ID, event_type: "STAGE_IN", scanned_at: daysAgo(9), metadata: {} },
    { lot_id: "b0000000-0000-0000-0000-000000000001", stage_id: STAGES.PRODUCAO, user_id: OPERADOR_ID, event_type: "STAGE_IN", scanned_at: daysAgo(7), metadata: {} },
    // Lot L002 (OP-002): CORTE → AVIAMENTOS → PRODUCAO → TRAVETE
    { lot_id: "b0000000-0000-0000-0000-000000000002", stage_id: STAGES.CORTE, user_id: OPERADOR_ID, event_type: "STAGE_IN", scanned_at: daysAgo(12), metadata: {} },
    { lot_id: "b0000000-0000-0000-0000-000000000002", stage_id: STAGES.AVIAMENTOS, user_id: OPERADOR_ID, event_type: "STAGE_IN", scanned_at: daysAgo(11), metadata: {} },
    { lot_id: "b0000000-0000-0000-0000-000000000002", stage_id: STAGES.PRODUCAO, user_id: OPERADOR_ID, event_type: "STAGE_IN", scanned_at: daysAgo(8), metadata: {} },
    { lot_id: "b0000000-0000-0000-0000-000000000002", stage_id: STAGES.TRAVETE, user_id: OPERADOR_ID, event_type: "STAGE_IN", scanned_at: daysAgo(3), metadata: {} },
    // Lot L003 (OP-002): CORTE → AVIAMENTOS → sent to faction
    { lot_id: "b0000000-0000-0000-0000-000000000003", stage_id: STAGES.CORTE, user_id: OPERADOR_ID, event_type: "STAGE_IN", scanned_at: daysAgo(15), metadata: {} },
    { lot_id: "b0000000-0000-0000-0000-000000000003", stage_id: STAGES.AVIAMENTOS, user_id: OPERADOR_ID, event_type: "STAGE_IN", scanned_at: daysAgo(14), metadata: {} },
    { lot_id: "b0000000-0000-0000-0000-000000000003", stage_id: STAGES.PRODUCAO, user_id: OPERADOR_ID, event_type: "FACTION_SEND", scanned_at: daysAgo(12), metadata: { faction_id: FACTION_ID } },
    // Lot L001 (OP-003 completed): Full flow through all stages
    { lot_id: "b0000000-0000-0000-0000-000000000004", stage_id: STAGES.CORTE, user_id: OPERADOR_ID, event_type: "STAGE_IN", scanned_at: daysAgo(30), metadata: {} },
    { lot_id: "b0000000-0000-0000-0000-000000000004", stage_id: STAGES.AVIAMENTOS, user_id: OPERADOR_ID, event_type: "STAGE_IN", scanned_at: daysAgo(29), metadata: {} },
    { lot_id: "b0000000-0000-0000-0000-000000000004", stage_id: STAGES.PRODUCAO, user_id: OPERADOR_ID, event_type: "STAGE_IN", scanned_at: daysAgo(27), metadata: {} },
    { lot_id: "b0000000-0000-0000-0000-000000000004", stage_id: STAGES.TRAVETE, user_id: OPERADOR_ID, event_type: "STAGE_IN", scanned_at: daysAgo(22), metadata: {} },
    { lot_id: "b0000000-0000-0000-0000-000000000004", stage_id: STAGES.LIMPEZA, user_id: OPERADOR_ID, event_type: "STAGE_IN", scanned_at: daysAgo(21), metadata: {} },
    { lot_id: "b0000000-0000-0000-0000-000000000004", stage_id: STAGES.CONFERENCIA, user_id: OPERADOR_ID, event_type: "STAGE_IN", scanned_at: daysAgo(20), metadata: {} },
    { lot_id: "b0000000-0000-0000-0000-000000000004", stage_id: STAGES.EMBALAGEM, user_id: OPERADOR_ID, event_type: "STAGE_IN", scanned_at: daysAgo(19), metadata: {} },
    { lot_id: "b0000000-0000-0000-0000-000000000004", stage_id: STAGES.ESTOQUE, user_id: OPERADOR_ID, event_type: "STOCK_ENTRY", scanned_at: daysAgo(18), metadata: {} },
    // Defect detection event for rework lot
    { lot_id: "b0000000-0000-0000-0000-000000000006", stage_id: STAGES.CONFERENCIA, user_id: OPERADOR_ID, event_type: "DEFECT_DETECTED", scanned_at: daysAgo(2), metadata: { defect_type: "COSTURA", quantity: 8 } },
  ];

  const { error: scanErr, data: scanData } = await sb.from("scan_events").insert(scanEvents).select("id");
  if (scanErr) console.error("  Scan events:", scanErr.message);
  else console.log(`  Created ${scanData?.length} scan events`);

  // ─── 8. Create faction shipments ───
  console.log("\n8. Creating faction shipments...");
  const SHIP1_ID = "c0000000-0000-0000-0000-000000000001";
  const SHIP2_ID = "c0000000-0000-0000-0000-000000000002";
  const SHIP3_ID = "c0000000-0000-0000-0000-000000000003";
  const SHIP4_ID = "c0000000-0000-0000-0000-000000000004";

  const shipments = [
    // SENT — lot L003 at faction
    {
      id: SHIP1_ID,
      faction_id: FACTION_ID,
      lot_id: "b0000000-0000-0000-0000-000000000003",
      driver_id: DRIVER_ID,
      quantity_sent: 100,
      sent_at: daysAgo(12),
      expected_return_at: daysAgo(5),
      sent_by: ADMIN_ID,
      status: "OVERDUE",
      payment_value: 6700.00,
      notes: "Envio para facção TESTE — lote L003",
      faction_confirmed_at: daysAgo(11),
    },
    // RECEIVED_BY_FACTION — lot L001 at faction (OP-002)
    {
      id: SHIP2_ID,
      faction_id: FACTION_ID,
      lot_id: "b0000000-0000-0000-0000-000000000001",
      driver_id: DRIVER_ID,
      quantity_sent: 100,
      sent_at: daysAgo(7),
      expected_return_at: daysFromNow(3),
      sent_by: ADMIN_ID,
      status: "RECEIVED_BY_FACTION",
      payment_value: 6700.00,
      faction_confirmed_at: daysAgo(6),
      faction_estimated_return_at: daysFromNow(2),
    },
    // RETURNED — lot from completed OP
    {
      id: SHIP3_ID,
      faction_id: FACTION2_ID,
      lot_id: "b0000000-0000-0000-0000-000000000004",
      driver_id: DRIVER_ID,
      quantity_sent: 100,
      quantity_returned: 95,
      quantity_defective: 5,
      sent_at: daysAgo(28),
      expected_return_at: daysAgo(21),
      actual_return_at: daysAgo(20),
      sent_by: ADMIN_ID,
      received_by: GERENTE_ID,
      status: "RETURNED",
      payment_value: 4500.00,
      deduction_value: 225.00,
      faction_confirmed_at: daysAgo(27),
    },
    // PREPARING — new shipment not yet sent
    {
      id: SHIP4_ID,
      faction_id: FACTION2_ID,
      lot_id: "b0000000-0000-0000-0000-000000000002",
      quantity_sent: 100,
      sent_at: new Date().toISOString(),
      expected_return_at: daysFromNow(7),
      sent_by: ADMIN_ID,
      status: "PREPARING",
      payment_value: 4500.00,
    },
  ];

  for (const ship of shipments) {
    const { error } = await sb.from("faction_shipments").upsert(ship, { onConflict: "id" });
    if (error) console.error(`  Shipment ${ship.id.substring(0, 8)}:`, error.message);
    else console.log(`  Shipment: ${ship.status} — ${ship.quantity_sent} pcs → ${ship.faction_id === FACTION_ID ? "TESTE" : "Maria Costura"}`);
  }

  // ─── 9. Create defect records ───
  console.log("\n9. Creating defect records...");
  const defects = [
    // Defect on lot L004 (rework) - PENDING
    {
      lot_id: "b0000000-0000-0000-0000-000000000006",
      quantity: 5,
      defect_type: "COSTURA",
      severity: "MEDIO",
      description: "Costuras desalinhadas na manga esquerda",
      detected_by: OPERADOR_ID,
      detected_at: daysAgo(2),
      status: "PENDING",
      previous_stage_id: STAGES.CONFERENCIA,
    },
    // Defect on lot L004 - GRAVE
    {
      lot_id: "b0000000-0000-0000-0000-000000000006",
      quantity: 3,
      defect_type: "TECIDO",
      severity: "GRAVE",
      description: "Tecido rasgado na parte frontal",
      detected_by: OPERADOR_ID,
      detected_at: daysAgo(2),
      status: "PENDING",
      previous_stage_id: STAGES.CONFERENCIA,
    },
    // Defect from faction shipment - RESOLVED
    {
      lot_id: "b0000000-0000-0000-0000-000000000004",
      shipment_id: SHIP3_ID,
      quantity: 5,
      defect_type: "COSTURA",
      severity: "LEVE",
      description: "Acabamento irregular nas laterais",
      detected_by: GERENTE_ID,
      detected_at: daysAgo(20),
      resolved_by: OPERADOR_ID,
      resolved_at: daysAgo(18),
      resolved_quantity: 4,
      discarded_quantity: 1,
      resolution: "4 peças corrigidas manualmente, 1 descartada",
      status: "RESOLVED",
      previous_stage_id: STAGES.TRAVETE,
      faction_response: "Problema no lote de linha, já corrigido na produção",
      faction_response_at: daysAgo(19),
    },
    // Defect on overdue shipment - contested by faction
    {
      lot_id: "b0000000-0000-0000-0000-000000000003",
      shipment_id: SHIP1_ID,
      quantity: 8,
      defect_type: "AVIAMENTO",
      severity: "MEDIO",
      description: "Botões soltos em 8 peças",
      detected_by: ADMIN_ID,
      detected_at: daysAgo(4),
      status: "PENDING",
      contestation_reason: "Botões já estavam soltos antes do envio",
    },
    // Defect LEVE - another type
    {
      lot_id: "b0000000-0000-0000-0000-000000000005",
      quantity: 2,
      defect_type: "OUTRO",
      severity: "LEVE",
      description: "Mancha leve de tinta na etiqueta",
      detected_by: OPERADOR_ID,
      detected_at: daysAgo(15),
      resolved_by: OPERADOR_ID,
      resolved_at: daysAgo(14),
      resolved_quantity: 2,
      discarded_quantity: 0,
      resolution: "Etiquetas refeitas",
      status: "RESOLVED",
    },
  ];

  const { error: defErr, data: defData } = await sb.from("defect_records").insert(defects).select("id");
  if (defErr) console.error("  Defects:", defErr.message);
  else console.log(`  Created ${defData?.length} defect records`);

  // ─── 10. Create kiosk token ───
  console.log("\n10. Creating kiosk token...");
  const KIOSK_TOKEN_ID = "e0000000-0000-0000-0000-000000000001";
  const { error: kioskErr } = await sb.from("kiosk_tokens").upsert({
    id: KIOSK_TOKEN_ID,
    tenant_id: TENANT_ID,
    token: "e0000000-aaaa-bbbb-cccc-000000000001",
    name: "TV Produção Principal",
    scope: "dashboard",
    is_active: true,
  }, { onConflict: "id" });
  if (kioskErr) console.error("  Kiosk token:", kioskErr.message);
  else console.log("  Kiosk token: TV Produção Principal");

  // ─── 11. Create notifications ───
  console.log("\n11. Creating notifications...");
  const notifications = [
    // For admin
    { tenant_id: TENANT_ID, user_id: ADMIN_ID, type: "SHIPMENT_OVERDUE", title: "Envio Atrasado", message: "O lote OP-20260520-002-L003 está 5 dias atrasado na facção TESTE", severity: "WARNING", created_at: daysAgo(1) },
    { tenant_id: TENANT_ID, user_id: ADMIN_ID, type: "DEFECT_REPORTED", title: "Defeito Reportado", message: "8 peças com defeito no lote OP-20260520-002-L004", severity: "ERROR", created_at: daysAgo(2) },
    { tenant_id: TENANT_ID, user_id: ADMIN_ID, type: "PRODUCTION_TARGET", title: "Meta Atingida", message: "Meta diária de produção atingida: 520/500 peças", severity: "INFO", read_at: daysAgo(3), created_at: daysAgo(3) },
    // For operador
    { tenant_id: TENANT_ID, user_id: OPERADOR_ID, type: "TASK_ASSIGNED", title: "Nova Tarefa", message: "Lote OP-20260520-002-L002 aguardando bipagem em Travete", severity: "INFO", created_at: daysAgo(1) },
    // Role-based
    { tenant_id: TENANT_ID, target_role: "GERENTE", type: "QUALITY_ALERT", title: "Alerta de Qualidade", message: "Taxa de defeitos acima de 2% nos últimos 3 dias", severity: "WARNING", created_at: daysAgo(1) },
    // Faction notifications
    { tenant_id: TENANT_ID, faction_id: FACTION_ID, type: "SHIPMENT_SENT", title: "Novo Envio", message: "100 peças do lote L001 enviadas para você", severity: "INFO", created_at: daysAgo(7) },
    { tenant_id: TENANT_ID, faction_id: FACTION_ID, type: "DEFECT_DETECTED", title: "Defeito Detectado", message: "8 peças com botões soltos no lote L003", severity: "WARNING", created_at: daysAgo(4) },
    { tenant_id: TENANT_ID, faction_id: FACTION_ID, type: "RETURN_REMINDER", title: "Lembrete de Devolução", message: "O lote L003 está 5 dias atrasado para devolução", severity: "ERROR", created_at: daysAgo(1) },
  ];

  const { error: notifErr, data: notifData } = await sb.from("notifications").insert(notifications).select("id");
  if (notifErr) console.error("  Notifications:", notifErr.message);
  else console.log(`  Created ${notifData?.length} notifications`);

  // ─── 12. Create daily metrics (last 7 days) ───
  console.log("\n12. Creating daily metrics...");
  const metrics = [];
  for (let i = 7; i >= 0; i--) {
    const produced = 400 + Math.floor(Math.random() * 200);
    const defects_count = Math.floor(Math.random() * 15);
    metrics.push({
      tenant_id: TENANT_ID,
      date: dateOnly(-i),
      total_produced: produced,
      total_stocked: produced - defects_count - Math.floor(Math.random() * 20),
      total_defects: defects_count,
      total_lost: Math.floor(Math.random() * 3),
      allowance_rate: (defects_count / produced).toFixed(4),
      target_met: ((produced / 500) * 100).toFixed(2),
      top_producers: JSON.stringify([
        { user_id: OPERADOR_ID, name: "Rodrigo", count: Math.floor(produced * 0.4) },
        { user_id: COORDENADOR_ID, name: "Ana", count: Math.floor(produced * 0.3) },
      ]),
      stage_times: JSON.stringify({
        CORTE: 3.5 + Math.random(),
        AVIAMENTOS: 1.8 + Math.random(),
        PRODUCAO: 45 + Math.random() * 10,
      }),
      faction_summary: JSON.stringify({
        TESTE: { sent: 100, returned: i > 3 ? 0 : 95, defects: i > 3 ? 0 : 5 },
      }),
    });
  }

  const { error: metErr, data: metData } = await sb.from("daily_metrics").upsert(metrics, {
    onConflict: "tenant_id,date",
  }).select("id");
  if (metErr) console.error("  Daily metrics:", metErr.message);
  else console.log(`  Created/updated ${metData?.length} daily metrics`);

  // ─── 13. Create faction token with known PIN for portal testing ───
  console.log("\n13. Creating test faction token with known PIN...");
  const testPinHash = await bcrypt.hash("999999", 10);
  const TEST_FTOKEN_ID = "f0000000-0000-0000-0000-000000000001";
  const TEST_FTOKEN_UUID = "f0000000-aaaa-bbbb-cccc-000000000001";
  const { error: ftErr } = await sb.from("faction_tokens").upsert({
    id: TEST_FTOKEN_ID,
    tenant_id: TENANT_ID,
    faction_id: FACTION_ID,
    token: TEST_FTOKEN_UUID,
    pin_hash: testPinHash,
    name: "Token Teste QA",
    is_active: true,
  }, { onConflict: "id" });
  if (ftErr) console.error("  Faction token:", ftErr.message);
  else console.log(`  Faction token: Token Teste QA (PIN: 999999, token: ${TEST_FTOKEN_UUID})`);

  // ─── Summary ───
  console.log("\n========================================");
  console.log("TEST SEED COMPLETE — Test Credentials:");
  console.log("========================================");
  console.log("\nApp Login (PIN):");
  console.log("  ADMIN     - Fabinho    - PIN: 1234");
  console.log("  GERENTE   - Marcos     - PIN: 1111");
  console.log("  COORDENADOR - Ana      - PIN: 2222");
  console.log("  OPERADOR  - Rodrigo    - PIN: 5678");
  console.log("\nFaction Portal:");
  console.log("  Token: f0000000-aaaa-bbbb-cccc-000000000001");
  console.log("  PIN:   999999");
  console.log("  URL:   /portal?token=f0000000-aaaa-bbbb-cccc-000000000001");
  console.log("\nKiosk TV:");
  console.log("  Token: e0000000-aaaa-bbbb-cccc-000000000001");
  console.log("  URL:   /kiosk/tv?token=e0000000-aaaa-bbbb-cccc-000000000001");
  console.log("\nTest Barcodes (for scanning):");
  console.log("  Fresh (CREATED):  OP-20260603-889-L001");
  console.log("  In Progress:      OP-20260520-002-L001");
  console.log("  At Faction:       OP-20260520-002-L003");
  console.log("  In Rework:        OP-20260520-002-L004");
  console.log("  In Stock:         OP-20260410-003-L001");
  console.log("  Invalid format:   INVALIDO-123");
  console.log("  Not in DB:        OP-20260603-999-L999");
  console.log("========================================");
}

main().catch(console.error);

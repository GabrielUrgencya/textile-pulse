import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const OPERADOR_ID = "00000000-0000-0000-0000-000000000002";
const ADMIN_ID = "00000000-0000-0000-0000-000000000001";
const GERENTE_ID = "00000000-0000-0000-0000-000000000003";
const STAGES = {
  TRAVETE: "4fdea089-b82c-4d64-8469-ac476bcc707f",
  CONFERENCIA: "3a2540e1-5cb9-4146-8898-f82dd3c55d2c",
};

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

const defects = [
  // 1. Simple pending defect
  { lot_id: "b0000000-0000-0000-0000-000000000006", quantity: 5, defect_type: "COSTURA", severity: "MEDIO", description: "Costuras desalinhadas na manga esquerda", detected_by: OPERADOR_ID, detected_at: daysAgo(2), status: "PENDING", previous_stage_id: STAGES.CONFERENCIA, resolved_quantity: 0, discarded_quantity: 0 },
  // 2. Grave pending defect
  { lot_id: "b0000000-0000-0000-0000-000000000006", quantity: 3, defect_type: "TECIDO", severity: "GRAVE", description: "Tecido rasgado na parte frontal", detected_by: OPERADOR_ID, detected_at: daysAgo(2), status: "PENDING", previous_stage_id: STAGES.CONFERENCIA, resolved_quantity: 0, discarded_quantity: 0 },
  // 3. Resolved defect from faction (WITHOUT faction_response first)
  { lot_id: "b0000000-0000-0000-0000-000000000004", shipment_id: "c0000000-0000-0000-0000-000000000003", quantity: 5, defect_type: "COSTURA", severity: "LEVE", description: "Acabamento irregular nas laterais", detected_by: GERENTE_ID, detected_at: daysAgo(20), resolved_by: OPERADOR_ID, resolved_at: daysAgo(18), resolved_quantity: 4, discarded_quantity: 1, resolution: "4 pecas corrigidas, 1 descartada", status: "RESOLVED", previous_stage_id: STAGES.TRAVETE },
  // 4. Pending defect with contestation (WITHOUT faction fields)
  { lot_id: "b0000000-0000-0000-0000-000000000003", shipment_id: "c0000000-0000-0000-0000-000000000001", quantity: 8, defect_type: "AVIAMENTO", severity: "MEDIO", description: "Botoes soltos em 8 pecas", detected_by: ADMIN_ID, detected_at: daysAgo(4), status: "PENDING", resolved_quantity: 0, discarded_quantity: 0 },
  // 5. Resolved simple defect
  { lot_id: "b0000000-0000-0000-0000-000000000005", quantity: 2, defect_type: "OUTRO", severity: "LEVE", description: "Mancha leve de tinta na etiqueta", detected_by: OPERADOR_ID, detected_at: daysAgo(15), resolved_by: OPERADOR_ID, resolved_at: daysAgo(14), resolved_quantity: 2, discarded_quantity: 0, resolution: "Etiquetas refeitas", status: "RESOLVED" },
];

async function main() {
  for (let i = 0; i < defects.length; i++) {
    const d = defects[i];
    const { error, data } = await sb.from("defect_records").insert(d).select("id");
    if (error) {
      console.log(`Defect ${i + 1}: FAILED — ${error.message}`);
    } else {
      console.log(`Defect ${i + 1}: OK (${data[0].id.substring(0, 8)})`);
    }
  }

  const { count } = await sb.from("defect_records").select("*", { count: "exact", head: true });
  console.log(`\nTotal defect_records: ${count}`);
}

main().catch(console.error);

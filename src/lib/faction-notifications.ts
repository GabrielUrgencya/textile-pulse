import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Notificações estratégicas para a FACÇÃO (portal).
 *
 * Inserem em `notifications` com audience 'FACTION'. Notificações são
 * informativas e unidirecionais — nenhuma ação/confirmação embutida.
 * `dedupeKey` (UNIQUE parcial no banco) permite que crons rodem N vezes sem
 * duplicar: violação 23505 é dedupe esperado, não erro.
 */

export const FACTION_NOTIFICATION_TYPES = {
  // Grupo 1 — Prazo de entrega
  DEADLINE_7D: "DEADLINE_7D",
  DEADLINE_3D: "DEADLINE_3D",
  DEADLINE_1D: "DEADLINE_1D",
  DEADLINE_OVERDUE: "DEADLINE_OVERDUE",
  // Grupo 2 — Devolução e peças
  RETURN_REGISTERED: "RETURN_REGISTERED",
  RETURN_PICKUP_3D: "RETURN_PICKUP_3D",
  RETURN_NOT_PICKED: "RETURN_NOT_PICKED",
  // Grupo 3 — Financeiro
  PAYMENT_RELEASED: "PAYMENT_RELEASED",
  PAYMENT_PARTIAL: "PAYMENT_PARTIAL",
  DEDUCTION_APPLIED: "DEDUCTION_APPLIED",
  BALANCE_NEGATIVE: "BALANCE_NEGATIVE",
  // Grupo 4 — Remessa
  SHIPMENT_NEW: "SHIPMENT_NEW",
  SHIPMENT_APPROVED: "SHIPMENT_APPROVED",
  SHIPMENT_REJECTED: "SHIPMENT_REJECTED",
  // Épico Robustez F2 — encerramento/reabertura
  SHIPMENT_CLOSED: "SHIPMENT_CLOSED",
  SHIPMENT_REOPENED: "SHIPMENT_REOPENED",
} as const;

export type FactionNotificationType =
  (typeof FACTION_NOTIFICATION_TYPES)[keyof typeof FACTION_NOTIFICATION_TYPES];

export interface NotifyFactionInput {
  tenantId: string;
  factionId: string;
  type: FactionNotificationType | string;
  title: string;
  message: string;
  severity?: "INFO" | "WARNING" | "CRITICAL";
  entityType?: "shipment" | "defect" | "financial" | string;
  entityId?: string | null;
  dedupeKey?: string | null;
}

/**
 * Insere a notificação. Nunca lança: erros são logados (e 23505 com dedupeKey
 * é silencioso — significa "já notificado").
 * @returns true se criou; false se dedupe/erro.
 */
export async function notifyFaction(
  supabase: SupabaseClient,
  input: NotifyFactionInput,
): Promise<boolean> {
  try {
    const { error } = await supabase.from("notifications").insert({
      tenant_id: input.tenantId,
      faction_id: input.factionId,
      audience: "FACTION",
      type: input.type,
      title: input.title,
      message: input.message,
      severity: input.severity || "INFO",
      entity_type: input.entityType || null,
      entity_id: input.entityId || null,
      dedupe_key: input.dedupeKey || null,
    });
    if (error) {
      // 23505 = UNIQUE(dedupe_key): já notificado — comportamento esperado.
      if (input.dedupeKey && error.code === "23505") return false;
      console.error("[notifyFaction]", input.type, error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[notifyFaction]", input.type, e);
    return false;
  }
}

/** Formata dinheiro pt-BR (valor absoluto, sem sinal). */
export function brl(value: number): string {
  return Math.abs(Number(value) || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

import { randomInt } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const DELIVERY_CODE_EXPIRY_HOURS = 48;
const MAX_GENERATION_RETRIES = 3;

/**
 * Generate a unique 6-digit delivery code for a shipment.
 * Uses crypto.randomInt for secure random generation.
 * Retries up to 3 times to avoid collision with active shipments.
 */
export async function generateUniqueDeliveryCode(
  supabase: SupabaseClient
): Promise<{ code: string; expiresAt: string }> {
  for (let i = 0; i < MAX_GENERATION_RETRIES; i++) {
    const code = String(randomInt(100000, 999999));

    // Check uniqueness among active shipments (PREPARING or SENT)
    const { data: existing } = await supabase
      .from("faction_shipments")
      .select("id")
      .eq("delivery_code", code)
      .in("status", ["PREPARING", "SENT"])
      .limit(1);

    if (!existing || existing.length === 0) {
      const expiresAt = new Date(
        Date.now() + DELIVERY_CODE_EXPIRY_HOURS * 60 * 60 * 1000
      ).toISOString();
      return { code, expiresAt };
    }
  }

  throw new Error("Failed to generate unique delivery code after retries");
}

/**
 * Validate a delivery code for a shipment.
 * Returns result with status and message.
 */
export function validateDeliveryCode(
  shipment: {
    delivery_code: string | null;
    delivery_code_expires_at: string | null;
    delivery_code_attempts: number;
  },
  inputCode: string
): { valid: boolean; error?: string; errorCode?: string } {
  const MAX_ATTEMPTS = 5;

  if (shipment.delivery_code_attempts >= MAX_ATTEMPTS) {
    return {
      valid: false,
      error: "Muitas tentativas. Contate o fornecedor.",
      errorCode: "BLOCKED",
    };
  }

  if (!shipment.delivery_code) {
    return {
      valid: false,
      error: "Código de entrega não encontrado",
      errorCode: "NO_CODE",
    };
  }

  if (
    shipment.delivery_code_expires_at &&
    new Date(shipment.delivery_code_expires_at) < new Date()
  ) {
    return {
      valid: false,
      error: "Código de entrega expirado. Solicite um novo ao fornecedor.",
      errorCode: "EXPIRED",
    };
  }

  if (shipment.delivery_code !== inputCode) {
    return {
      valid: false,
      error: "Código inválido",
      errorCode: "INVALID",
    };
  }

  return { valid: true };
}

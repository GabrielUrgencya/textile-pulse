/**
 * WhatsApp service stub — prepared for Evolution API integration (Phase 2).
 * Story 6.3 (AC5)
 *
 * Future env vars: EVOLUTION_API_URL, EVOLUTION_API_KEY
 */

export interface WhatsAppPayload {
  phone: string;
  message: string;
}

/**
 * Stub: logs a warning and returns without error.
 * Will be replaced with Evolution API integration in Story 6.10.
 */
export async function sendWhatsApp(payload: WhatsAppPayload): Promise<boolean> {
  console.warn(
    "[whatsapp-service] WhatsApp integration not configured — message not sent:",
    { phone: payload.phone }
  );
  return false;
}

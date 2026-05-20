/**
 * Unified notification dispatch service.
 * Story 6.3 (AC1, AC2, AC3, AC4, AC8)
 *
 * Dispatches notifications to configured channels:
 * - internal: inserts into notifications table
 * - email: sends via Resend SDK
 * - whatsapp: stub (Phase 2)
 */

import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "./email-service";
import { sendWhatsApp } from "./whatsapp-service";


// --- Types (AC2) ---

export type NotificationChannel = "internal" | "email" | "whatsapp";

export interface NotificationPayload {
  tenantId: string;
  type: string;
  title: string;
  message: string;
  severity?: string;
  factionId?: string;
  channels: NotificationChannel[];
  recipientRoles?: string[];
  recipientEmail?: string | string[];
  recipientPhone?: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationResult {
  internal: boolean;
  email: boolean;
  whatsapp: boolean;
}

// --- Service ---

/**
 * Dispatches a notification to all specified channels.
 * Internal channel always runs first. Email/WhatsApp failures
 * are logged to console but never block the flow (AC8).
 */
export async function sendNotification(
  payload: NotificationPayload
): Promise<NotificationResult> {
  const result: NotificationResult = {
    internal: false,
    email: false,
    whatsapp: false,
  };

  // Internal channel (AC3) — always attempted if in channels list
  if (payload.channels.includes("internal")) {
    result.internal = await dispatchInternal(payload);
  }

  // Email channel (AC4)
  if (payload.channels.includes("email") && payload.recipientEmail) {
    result.email = await dispatchEmail(payload);
  }

  // WhatsApp channel (AC5) — stub
  if (payload.channels.includes("whatsapp") && payload.recipientPhone) {
    result.whatsapp = await sendWhatsApp({
      phone: payload.recipientPhone,
      message: `${payload.title}\n\n${payload.message}`,
    });
  }

  return result;
}

// --- Channel Implementations ---

async function dispatchInternal(
  payload: NotificationPayload
): Promise<boolean> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await supabase.from("notifications").insert({
      tenant_id: payload.tenantId,
      faction_id: payload.factionId || null,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      severity: payload.severity || "INFO",
    });

    if (error) {
      console.error("[notification-service] Failed to insert notification:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("[notification-service] Internal dispatch error:", error);
    return false;
  }
}

async function dispatchEmail(
  payload: NotificationPayload
): Promise<boolean> {
  if (!payload.recipientEmail) return false;

  return sendEmail({
    to: payload.recipientEmail,
    subject: `[LISION] ${payload.title}`,
    html: buildEmailHtml(payload),
  });
}

function buildEmailHtml(payload: NotificationPayload): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #1a1a2e; color: #fff; padding: 20px; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">LISION</h1>
      </div>
      <div style="padding: 24px; background: #f9fafb;">
        <h2 style="color: #1a1a2e; margin-top: 0;">${payload.title}</h2>
        <p style="color: #374151; line-height: 1.6;">${payload.message}</p>
      </div>
      <div style="padding: 16px; text-align: center; color: #9ca3af; font-size: 12px;">
        <p>Este e-mail foi enviado automaticamente pelo sistema LISION.</p>
      </div>
    </div>
  `;
}

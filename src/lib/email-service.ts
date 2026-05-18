/**
 * Email service using Resend SDK.
 * Story 6.3 (AC4, AC6) — Transactional emails for the Faction Portal.
 *
 * Requires env var: RESEND_API_KEY
 * Domain must be verified in Resend dashboard before emails will deliver.
 */

import { Resend } from "resend";
import * as Sentry from "@sentry/nextjs";

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

const FROM_ADDRESS =
  process.env.RESEND_FROM_ADDRESS || "LISION <noreply@lision.app>";

export interface EmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}

/**
 * Sends a transactional email via Resend.
 * On failure, logs to Sentry but does NOT throw (AC8).
 * Returns true if sent successfully, false otherwise.
 */
export async function sendEmail(payload: EmailPayload): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[email-service] RESEND_API_KEY not configured — skipping email send");
    return false;
  }

  try {
    await getResend().emails.send({
      from: FROM_ADDRESS,
      to: Array.isArray(payload.to) ? payload.to : [payload.to],
      subject: payload.subject,
      html: payload.html,
      replyTo: payload.replyTo,
    });
    return true;
  } catch (error) {
    console.error("[email-service] Failed to send email:", error);
    Sentry.captureException(error, {
      tags: { service: "email", provider: "resend" },
      extra: { subject: payload.subject, to: payload.to },
    });
    return false;
  }
}

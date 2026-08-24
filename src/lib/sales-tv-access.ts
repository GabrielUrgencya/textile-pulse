import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export const SALES_TV_HEX_PATTERN = /^[0-9a-f]{64}$/;
const hex = z.string().regex(SALES_TV_HEX_PATTERN);
const decimal = z.number().finite();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const unavailable = z.object({ available: z.literal(false) }).strict();
const empty = z
  .object({
    available: z.literal(true),
    empty: z.literal(true),
    refresh_after_seconds: z.number().int().positive(),
    identity_key: hex,
  })
  .strict();
const comparison = z.discriminatedUnion("available", [
  z.object({ available: z.literal(false) }).strict(),
  z
    .object({
      available: z.literal(true),
      previous_percent: decimal,
      delta_percent: decimal,
      direction: z.enum(["ABOVE", "BELOW", "STABLE"]),
    })
    .strict(),
]);
// União simples (NÃO discriminatedUnion): há duas variantes com available:false
// (vazia e ACKNOWLEDGED), então "available" não é um discriminador único —
// discriminatedUnion lançava "Duplicate discriminator value false" e derrubava a TV.
const celebration = z.union([
  z.object({ available: z.literal(false) }).strict(),
  z
    .object({
      available: z.literal(false),
      receipt_state: z.literal("ACKNOWLEDGED"),
    })
    .strict(),
  z
    .object({
      available: z.literal(true),
      milestone: z.literal("COLLECTIVE"),
      receipt: hex,
      receipt_state: z.literal("PENDING"),
    })
    .strict(),
]);
const snapshot = z
  .object({
    available: z.literal(true),
    empty: z.literal(false),
    refresh_after_seconds: z.number().int().positive(),
    identity_key: hex,
    period: z
      .object({
        starts_on: date,
        ends_on: date,
        status: z.enum(["OPEN", "CLOSED"]),
      })
      .strict(),
    progress: z
      .object({
        percent: decimal,
        ideal_pace_percent: decimal,
        necessary_per_business_day_percent: decimal,
        band: z.enum(["BUILDING", "ALERT", "ACHIEVED"]),
      })
      .strict(),
    comparison,
    celebration,
    updated_at: z.string().datetime({ offset: true }),
  })
  .strict();

export const salesTvSnapshotSchema = z.union([unavailable, empty, snapshot]);
export type SalesTvSnapshot = z.infer<typeof salesTvSnapshotSchema>;

export const salesTvQuerySchema = z
  .object({
    periodKey: hex.optional(),
    receipt: hex.optional(),
  })
  .strict();
export const salesTvAckSchema = z.object({ receipt: hex }).strict();

export function isValidSalesTvToken(token: string): boolean {
  return SALES_TV_HEX_PATTERN.test(token);
}

export async function loadSalesTvSnapshot(
  supabase: SupabaseClient,
  input: { token: string; periodKey?: string; receipt?: string },
): Promise<SalesTvSnapshot> {
  const { data, error } = await supabase.rpc("sales_tv_kiosk_snapshot_v2", {
    p_token: input.token,
    p_period_key: input.periodKey ?? null,
    p_receipt: input.receipt ?? null,
  });
  if (error) return { available: false };
  const parsed = salesTvSnapshotSchema.safeParse(data);
  return parsed.success ? parsed.data : { available: false };
}

export async function acknowledgeSalesTvCelebration(
  supabase: SupabaseClient,
  token: string,
  receipt: string,
): Promise<void> {
  await supabase.rpc("sales_tv_kiosk_ack_v2", {
    p_token: token,
    p_receipt: receipt,
  });
}

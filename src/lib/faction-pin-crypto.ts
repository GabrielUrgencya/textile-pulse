import crypto from "crypto";

const DOMAIN = "lision:faction-pin:v1";

function encryptionKey(): Buffer {
  const configured = process.env.FACTION_PIN_ENCRYPTION_KEY?.trim();
  if (configured) {
    const key = /^[a-f0-9]{64}$/i.test(configured) ? Buffer.from(configured, "hex") : Buffer.from(configured, "base64");
    if (key.length !== 32) throw new Error("FACTION_PIN_ENCRYPTION_KEY must encode exactly 32 bytes");
    return key;
  }
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!fallback) throw new Error("Faction PIN encryption key is not configured");
  return crypto.createHash("sha256").update(`${DOMAIN}:${fallback}`, "utf8").digest();
}

export function encryptFactionPin(pin: string): string {
  if (!/^\d{6}$/.test(pin)) throw new Error("Faction PIN must contain six digits");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(DOMAIN, "utf8"));
  const encrypted = Buffer.concat([cipher.update(pin, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptFactionPin(value: string): string {
  const [version, ivRaw, tagRaw, encryptedRaw] = value.split(".");
  if (version !== "v1" || !ivRaw || !tagRaw || !encryptedRaw) throw new Error("Invalid faction PIN ciphertext");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAAD(Buffer.from(DOMAIN, "utf8"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, "base64url")), decipher.final()]).toString("utf8");
}

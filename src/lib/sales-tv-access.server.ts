import { createHash } from "node:crypto";

/**
 * Chave de rate limit derivada de IP (+ token). Isolada aqui porque usa
 * `node:crypto` — mantê-la fora de `sales-tv-access.ts` evita que o módulo
 * (importado por um client component) arraste `node:crypto` para o bundle.
 */
export function salesTvRateLimitKey(ip: string, token?: string): string {
  const material = token ? `${ip}\0${token}` : ip;
  return `sales-tv:${createHash("sha256").update(material).digest("hex")}`;
}

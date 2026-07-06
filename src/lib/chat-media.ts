import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Mídia do chat (bucket privado `chat-media`, acesso server-side via service
 * role). content_url guarda o PATH no bucket; URLs assinadas (TTL 1h) são
 * geradas na leitura — nunca persistidas.
 */

export const CHAT_MEDIA_BUCKET = "chat-media";
export const CHAT_MEDIA_MAX_BYTES = 25 * 1024 * 1024;
export const SIGNED_URL_TTL = 3600;

const ALLOWED_MIME = [
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "video/mp4", "video/webm",
  "audio/webm", "audio/mpeg", "audio/mp4", "audio/ogg",
  "application/pdf", "application/zip",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

export function validateChatFile(file: File): { ok: true } | { ok: false; error: string } {
  if (file.size > CHAT_MEDIA_MAX_BYTES) {
    return { ok: false, error: "Arquivo acima de 25MB" };
  }
  // audio/webm;codecs=opus → normaliza para comparação
  const mime = file.type.split(";")[0];
  if (!ALLOWED_MIME.includes(mime)) {
    return { ok: false, error: `Tipo de arquivo não suportado (${mime || "desconhecido"})` };
  }
  return { ok: true };
}

/** image/* → image; video/* → video; audio/* → audio; senão file. */
export function contentTypeFromMime(mime: string): "image" | "video" | "audio" | "file" {
  const m = mime.split(";")[0];
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return "file";
}

/** Path no bucket: {tenantId}/{factionId}/{ts}-{rand}.{ext} */
export function chatMediaPath(tenantId: string, factionId: string, fileName: string): string {
  const ext = (fileName.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const rand = Math.random().toString(36).slice(2, 8);
  return `${tenantId}/${factionId}/${Date.now()}-${rand}.${ext}`;
}

/** Sobe o arquivo (service role) e retorna o path. */
export async function uploadChatMedia(
  storageClient: SupabaseClient,
  tenantId: string,
  factionId: string,
  file: File,
): Promise<{ path: string } | { error: string }> {
  const path = chatMediaPath(tenantId, factionId, file.name);
  const { error } = await storageClient.storage
    .from(CHAT_MEDIA_BUCKET)
    .upload(path, file, { contentType: file.type.split(";")[0] });
  if (error) return { error: error.message };
  return { path };
}

/** Gera signed URLs em lote e anexa signed_url às mensagens com content_url. */
export async function attachSignedUrls<T extends { content_url?: string | null }>(
  storageClient: SupabaseClient,
  messages: T[],
): Promise<(T & { signed_url?: string })[]> {
  const paths = messages.map((m) => m.content_url).filter((p): p is string => !!p);
  if (paths.length === 0) return messages;

  const { data } = await storageClient.storage
    .from(CHAT_MEDIA_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL);

  const byPath = new Map<string, string>();
  for (const item of data || []) {
    if (item.path && item.signedUrl) byPath.set(item.path, item.signedUrl);
  }
  return messages.map((m) =>
    m.content_url && byPath.has(m.content_url)
      ? { ...m, signed_url: byPath.get(m.content_url) }
      : m,
  );
}

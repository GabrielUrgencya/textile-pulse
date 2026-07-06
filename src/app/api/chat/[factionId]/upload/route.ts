import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";
import { dbError, requireTenantId } from "@/lib/api-helpers";
import {
  validateChatFile,
  contentTypeFromMime,
  uploadChatMedia,
  attachSignedUrls,
} from "@/lib/chat-media";

/**
 * POST /api/chat/[factionId]/upload — envio de mídia pelo ADMIN (Fases B/C).
 * Storage via service role (bucket privado nega sessão); insert da mensagem
 * via client da sessão (RLS).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ factionId: string }> },
) {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  if (!can(user, "factions:view")) {
    return NextResponse.json({ error: "Forbidden: factions:view required" }, { status: 403 });
  }
  const t = requireTenantId(user);
  if (t.error) return t.error;

  const { factionId } = await params;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "MISSING_FILE", message: "Arquivo obrigatório" }, { status: 400 });
  }

  const valid = validateChatFile(file);
  if (!valid.ok) {
    return NextResponse.json({ error: "INVALID_FILE", message: valid.error }, { status: 400 });
  }

  const storage = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const uploaded = await uploadChatMedia(storage, t.tenantId, factionId, file);
  if ("error" in uploaded) {
    return NextResponse.json({ error: "UPLOAD_FAILED", message: uploaded.error }, { status: 500 });
  }

  const duration = Number(form?.get("duration"));
  const meta: Record<string, unknown> = { name: file.name, size: file.size, mime: file.type.split(";")[0] };
  if (Number.isFinite(duration) && duration > 0) meta.duration = Math.round(duration);

  const { data, error } = await supabase
    .from("faction_messages")
    .insert({
      tenant_id: t.tenantId,
      faction_id: factionId,
      sender_type: "ADMIN",
      sender_id: user.id,
      content_type: contentTypeFromMime(file.type),
      content_url: uploaded.path,
      content_meta: meta,
    })
    .select("id, sender_type, content_type, content_text, content_url, content_meta, read_at, created_at")
    .single();

  if (error) return dbError("POST /api/chat/[factionId]/upload", error);

  const [withUrl] = await attachSignedUrls(storage, [data]);
  return NextResponse.json({ data: withUrl }, { status: 201 });
}

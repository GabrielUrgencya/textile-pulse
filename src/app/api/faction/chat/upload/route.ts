import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateFactionSession } from "@/lib/faction-middleware";
import { dbError } from "@/lib/api-helpers";
import {
  validateChatFile,
  contentTypeFromMime,
  uploadChatMedia,
  attachSignedUrls,
} from "@/lib/chat-media";

/**
 * POST /api/faction/chat/upload — envio de mídia pela FACÇÃO (Fases B/C).
 * Tudo via service role (padrão do portal).
 */
export async function POST(request: Request) {
  const session = await validateFactionSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "MISSING_FILE", message: "Arquivo obrigatório" }, { status: 400 });
  }

  const valid = validateChatFile(file);
  if (!valid.ok) {
    return NextResponse.json({ error: "INVALID_FILE", message: valid.error }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const uploaded = await uploadChatMedia(supabase, session.tenantId, session.factionId, file);
  if ("error" in uploaded) {
    return NextResponse.json({ error: "UPLOAD_FAILED", message: uploaded.error }, { status: 500 });
  }

  const duration = Number(form?.get("duration"));
  const meta: Record<string, unknown> = { name: file.name, size: file.size, mime: file.type.split(";")[0] };
  if (Number.isFinite(duration) && duration > 0) meta.duration = Math.round(duration);

  const { data, error } = await supabase
    .from("faction_messages")
    .insert({
      tenant_id: session.tenantId,
      faction_id: session.factionId,
      sender_type: "FACTION",
      content_type: contentTypeFromMime(file.type),
      content_url: uploaded.path,
      content_meta: meta,
    })
    .select("id, sender_type, content_type, content_text, content_url, content_meta, read_at, created_at")
    .single();

  if (error) return dbError("POST /api/faction/chat/upload", error);

  const [withUrl] = await attachSignedUrls(supabase, [data]);
  return NextResponse.json({ data: withUrl }, { status: 201 });
}

import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";

/**
 * Story 8.33 — Upload da foto da facção para o bucket público faction-photos.
 * POST multipart (campo "file"). Retorna { url } pública. Requer factions:manage.
 */
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 2 * 1024 * 1024; // 2MB
const BUCKET = "faction-photos";

export async function POST(request: Request) {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  if (!can(user, "factions:manage")) {
    return NextResponse.json({ error: "Forbidden: factions:manage required" }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Arquivo não enviado" }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: "Formato inválido (use JPG, PNG ou WEBP)" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Imagem muito grande (máx. 2MB)" }, { status: 400 });
  }

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: true });

  if (error) {
    return NextResponse.json({ error: "Falha no upload", details: error.message }, { status: 500 });
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}

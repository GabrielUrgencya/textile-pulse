import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";
import { dbError, requireTenantId } from "@/lib/api-helpers";
import { attachSignedUrls } from "@/lib/chat-media";

/**
 * Chat admin ↔ facção — lado ADMIN. Frente 3 Fase A (texto).
 * GET: histórico paginado; abrir a conversa marca as mensagens da FACÇÃO como lidas.
 * POST: envia texto como ADMIN.
 */

export async function GET(
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
  const { searchParams } = new URL(request.url);
  const before = searchParams.get("before");
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50")));

  let query = supabase
    .from("faction_messages")
    .select("id, sender_type, content_type, content_text, content_url, content_meta, read_at, created_at")
    .eq("tenant_id", t.tenantId)
    .eq("faction_id", factionId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (before) query = query.lt("created_at", before);

  const { data, error } = await query;
  if (error) return dbError("GET /api/chat/[factionId]/messages", error);

  // Abrir a conversa = admin leu as mensagens da facção.
  await supabase
    .from("faction_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("tenant_id", t.tenantId)
    .eq("faction_id", factionId)
    .eq("sender_type", "FACTION")
    .is("read_at", null);

  // Signed URLs para mídia (storage exige service role — bucket privado)
  const storage = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const withUrls = await attachSignedUrls(storage, (data || []).reverse());

  return NextResponse.json({ data: withUrls });
}

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
  const body = await request.json().catch(() => null);
  const text = String(body?.text || "").trim();
  if (!text || text.length > 2000) {
    return NextResponse.json(
      { error: "INVALID_TEXT", message: "Mensagem vazia ou acima de 2000 caracteres" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("faction_messages")
    .insert({
      tenant_id: t.tenantId,
      faction_id: factionId,
      sender_type: "ADMIN",
      sender_id: user.id,
      content_type: "text",
      content_text: text,
    })
    .select("id, sender_type, content_type, content_text, read_at, created_at")
    .single();

  if (error) return dbError("POST /api/chat/[factionId]/messages", error);
  return NextResponse.json({ data }, { status: 201 });
}

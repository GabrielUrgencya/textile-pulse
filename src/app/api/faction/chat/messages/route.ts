import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateFactionSession } from "@/lib/faction-middleware";
import { dbError } from "@/lib/api-helpers";
import { attachSignedUrls } from "@/lib/chat-media";

/**
 * Chat admin ↔ facção — lado FACÇÃO (portal). Frente 3 Fase A (texto).
 * GET: histórico paginado; abrir marca as mensagens do ADMIN como lidas.
 * POST: envia texto como FACTION.
 */

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(request: Request) {
  const session = await validateFactionSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const before = searchParams.get("before");
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50")));

  const supabase = serviceClient();

  let query = supabase
    .from("faction_messages")
    .select("id, sender_type, content_type, content_text, content_url, content_meta, read_at, created_at")
    .eq("faction_id", session.factionId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (before) query = query.lt("created_at", before);

  const { data, error } = await query;
  if (error) return dbError("GET /api/faction/chat/messages", error);

  // Abrir a conversa = facção leu as mensagens do admin.
  await supabase
    .from("faction_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("faction_id", session.factionId)
    .eq("sender_type", "ADMIN")
    .is("read_at", null);

  // Badge de não lidas (após marcar, tende a 0 — usado pelo layout via ?countOnly)
  const { count: unreadCount } = await supabase
    .from("faction_messages")
    .select("id", { count: "exact", head: true })
    .eq("faction_id", session.factionId)
    .eq("sender_type", "ADMIN")
    .is("read_at", null);

  const withUrls = await attachSignedUrls(supabase, (data || []).reverse());

  return NextResponse.json({
    data: withUrls,
    unreadCount: unreadCount ?? 0,
  });
}

export async function POST(request: Request) {
  const session = await validateFactionSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const text = String(body?.text || "").trim();
  if (!text || text.length > 2000) {
    return NextResponse.json(
      { error: "INVALID_TEXT", message: "Mensagem vazia ou acima de 2000 caracteres" },
      { status: 400 },
    );
  }

  const supabase = serviceClient();
  const { data, error } = await supabase
    .from("faction_messages")
    .insert({
      tenant_id: session.tenantId,
      faction_id: session.factionId,
      sender_type: "FACTION",
      content_type: "text",
      content_text: text,
    })
    .select("id, sender_type, content_type, content_text, read_at, created_at")
    .single();

  if (error) return dbError("POST /api/faction/chat/messages", error);
  return NextResponse.json({ data }, { status: 201 });
}

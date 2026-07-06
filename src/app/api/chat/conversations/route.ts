import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";
import { dbError, requireTenantId } from "@/lib/api-helpers";

/**
 * GET /api/chat/conversations — Lista de conversas do admin (estilo WhatsApp).
 * Frente 3 Fase A. Facções ativas + última mensagem + não lidas (mensagens da
 * facção ainda não lidas pelo admin). Sem N+1: 2 queries + agregação em memória.
 */
export async function GET() {
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  if (!can(user, "factions:view")) {
    return NextResponse.json({ error: "Forbidden: factions:view required" }, { status: 403 });
  }

  const t = requireTenantId(user);
  if (t.error) return t.error;

  const [{ data: factions, error: facErr }, { data: messages, error: msgErr }] = await Promise.all([
    supabase
      .from("factions")
      .select("id, name, photo_url")
      .eq("tenant_id", t.tenantId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("faction_messages")
      .select("id, faction_id, sender_type, content_type, content_text, read_at, created_at")
      .eq("tenant_id", t.tenantId)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  if (facErr) return dbError("GET /api/chat/conversations (factions)", facErr);
  if (msgErr) return dbError("GET /api/chat/conversations (messages)", msgErr);

  interface MsgRow {
    id: string;
    faction_id: string;
    sender_type: string;
    content_type: string;
    content_text: string | null;
    read_at: string | null;
    created_at: string;
  }
  const byFaction = new Map<string, { last: MsgRow | null; unread: number }>();
  for (const m of (messages || []) as MsgRow[]) {
    const agg = byFaction.get(m.faction_id) || { last: null as MsgRow | null, unread: 0 };
    if (!agg.last) agg.last = m; // já ordenado desc → primeira é a última msg
    if (m.sender_type === "FACTION" && !m.read_at) agg.unread++;
    byFaction.set(m.faction_id, agg);
  }

  const conversations = (factions || []).map((f) => {
    const agg = byFaction.get(f.id);
    return {
      factionId: f.id,
      name: f.name,
      photoUrl: f.photo_url,
      lastMessage: agg?.last
        ? {
            text: agg.last.content_text,
            contentType: agg.last.content_type,
            senderType: agg.last.sender_type,
            createdAt: agg.last.created_at,
          }
        : null,
      unreadCount: agg?.unread || 0,
    };
  });

  // Não lidas primeiro; depois por recência da última mensagem.
  conversations.sort((a, b) => {
    if ((b.unreadCount > 0 ? 1 : 0) !== (a.unreadCount > 0 ? 1 : 0)) {
      return (b.unreadCount > 0 ? 1 : 0) - (a.unreadCount > 0 ? 1 : 0);
    }
    const ta = a.lastMessage?.createdAt || "";
    const tb = b.lastMessage?.createdAt || "";
    return tb.localeCompare(ta);
  });

  return NextResponse.json({ data: conversations });
}

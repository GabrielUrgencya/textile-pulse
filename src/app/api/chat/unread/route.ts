import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { can } from "@/lib/effective-permissions";
import { dbError, requireTenantId } from "@/lib/api-helpers";

/**
 * GET /api/chat/unread — mensagens de facção NÃO LIDAS (alimenta a notificação).
 *
 * Por que polling e não Realtime: o middleware grava o cookie da sessão como
 * httpOnly (protege o token de XSS), então o navegador não tem o JWT e o Realtime
 * com RLS é impossível sem enfraquecer essa proteção. Aqui o isolamento fica no
 * SERVIDOR — `.eq("tenant_id", t.tenantId)` — que é onde ele deve estar.
 *
 * Enxuto de propósito: roda a cada 10s em toda aba aberta. Devolve só o que o
 * toast precisa, com LIMIT — nada de agregação (é o que /api/chat/conversations
 * faz, e por isso ele não serve aqui).
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

  // Duas queries: a LISTA (capada, alimenta o toast) e a CONTAGEM EXATA (alimenta o
  // badge). messages.length NÃO serve de contagem — com 25 não lidas o LIMIT 20
  // faria o badge mentir "20".
  const [listRes, countRes] = await Promise.all([
    supabase
      .from("faction_messages")
      .select("id, faction_id, content_type, content_text, created_at, factions!inner(name)")
      .eq("tenant_id", t.tenantId)
      .eq("sender_type", "FACTION") // o admin não se notifica das próprias mensagens
      .is("read_at", null)
      .order("created_at", { ascending: true })
      .limit(20),
    supabase
      .from("faction_messages")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", t.tenantId)
      .eq("sender_type", "FACTION")
      .is("read_at", null),
  ]);

  const { data, error } = listRes;
  if (error) return dbError("GET /api/chat/unread", error);
  if (countRes.error) return dbError("GET /api/chat/unread (count)", countRes.error);

  interface Row {
    id: string;
    faction_id: string;
    content_type: string;
    content_text: string | null;
    created_at: string;
    factions: { name: string } | { name: string }[] | null;
  }

  const messages = ((data || []) as Row[]).map((m) => {
    const rel = Array.isArray(m.factions) ? m.factions[0] : m.factions;
    return {
      id: m.id,
      factionId: m.faction_id,
      factionName: rel?.name || "Facção",
      contentType: m.content_type,
      contentText: m.content_text,
      createdAt: m.created_at,
    };
  });

  return NextResponse.json({ data: messages, count: countRes.count ?? 0 });
}

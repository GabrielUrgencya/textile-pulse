import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateFactionSession } from "@/lib/faction-middleware";

/**
 * GET /api/faction/chat/unread — contagem de mensagens do ADMIN não lidas
 * (para o badge do bottom-nav). NÃO marca como lida.
 */
export async function GET() {
  const session = await validateFactionSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { count } = await supabase
    .from("faction_messages")
    .select("id", { count: "exact", head: true })
    .eq("faction_id", session.factionId)
    .eq("sender_type", "ADMIN")
    .is("read_at", null);

  return NextResponse.json({ unreadCount: count ?? 0 });
}

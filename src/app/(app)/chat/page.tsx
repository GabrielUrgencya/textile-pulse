"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { MessageCircle, Lock } from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";
import { ChatConversationList, type Conversation } from "@/components/chat/ChatConversationList";
import { ChatConversation, type ChatMessage } from "@/components/chat/ChatConversation";

/**
 * Chat admin ↔ facções (Frente 3 Fase A — texto, polling).
 * Lista 5s; conversa ativa 2s. Envio otimista com merge por id.
 */
function ChatPageContent() {
  const { can: hasPerm, isLoading } = usePermissions();
  const searchParams = useSearchParams();
  // ?faction=<id> — o clique no toast de nova mensagem abre a conversa direto.
  const factionParam = searchParams.get("faction");
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(factionParam);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [sending, setSending] = React.useState(false);

  // Reage ao param também quando a página JÁ está montada (toast clicado estando no chat).
  React.useEffect(() => {
    if (factionParam) setActiveId(factionParam);
  }, [factionParam]);

  // Lista de conversas (polling 5s)
  React.useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/chat/conversations")
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => { if (alive && json) setConversations(json.data || []); })
        .catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // Mensagens da conversa ativa (polling 2s, merge por id)
  React.useEffect(() => {
    if (!activeId) return;
    let alive = true;
    setMessages([]);
    const load = () =>
      fetch(`/api/chat/${activeId}/messages`)
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          if (!alive || !json) return;
          setMessages((prev) => {
            const seen = new Set((json.data || []).map((m: ChatMessage) => m.id));
            // Mantém otimistas locais (id temp) que o servidor ainda não devolveu
            const pending = prev.filter((m) => m.id.startsWith("tmp-") && !seen.has(m.id));
            return [...(json.data || []), ...pending];
          });
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 2000);
    return () => { alive = false; clearInterval(t); };
  }, [activeId]);

  const handleSend = async (text: string) => {
    if (!activeId) return;
    setSending(true);
    // Otimista
    const tmp: ChatMessage = {
      id: `tmp-${Date.now()}`,
      sender_type: "ADMIN",
      content_type: "text",
      content_text: text,
      read_at: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tmp]);
    try {
      const res = await fetch(`/api/chat/${activeId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.data) {
        setMessages((prev) => prev.map((m) => (m.id === tmp.id ? json.data : m)));
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== tmp.id));
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tmp.id));
    } finally {
      setSending(false);
    }
  };

  if (!isLoading && !hasPerm("factions:view")) {
    return (
      <div className="max-w-[900px] mx-auto px-6 py-16 text-center">
        <Lock className="size-10 mx-auto text-muted-foreground/40 mb-3" />
        <h2 className="text-[18px] font-semibold">Acesso restrito</h2>
      </div>
    );
  }

  const active = conversations.find((c) => c.factionId === activeId);

  return (
    <div className="flex h-[calc(100dvh-1px)] overflow-hidden">
      <ChatConversationList
        conversations={conversations}
        activeId={activeId}
        onSelect={setActiveId}
      />
      {active ? (
        <ChatConversation
          title={active.name}
          photoUrl={active.photoUrl}
          messages={messages}
          mySide="ADMIN"
          onSend={handleSend}
          sending={sending}
          uploadUrl={`/api/chat/${active.factionId}/upload`}
          onUploaded={(m) => setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))}
        />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <MessageCircle className="size-12 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Selecione uma facção para conversar.</p>
        </div>
      )}
    </div>
  );
}

/** useSearchParams exige Suspense no App Router (senão o build de produção falha). */
export default function ChatPage() {
  return (
    <React.Suspense fallback={null}>
      <ChatPageContent />
    </React.Suspense>
  );
}

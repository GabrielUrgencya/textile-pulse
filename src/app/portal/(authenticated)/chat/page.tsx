"use client";

import { useEffect, useState } from "react";
import { ChatConversation, type ChatMessage } from "@/components/chat/ChatConversation";

/**
 * Chat da facção com o admin (Frente 3 Fase A — texto, polling 2s).
 * Conversa única: o único contato é o suporte/admin.
 */
export default function PortalChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/faction/chat/messages")
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          if (!alive || !json) return;
          setMessages((prev) => {
            const seen = new Set((json.data || []).map((m: ChatMessage) => m.id));
            const pending = prev.filter((m) => m.id.startsWith("tmp-") && !seen.has(m.id));
            return [...(json.data || []), ...pending];
          });
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 2000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const handleSend = async (text: string) => {
    setSending(true);
    const tmp: ChatMessage = {
      id: `tmp-${Date.now()}`,
      sender_type: "FACTION",
      content_type: "text",
      content_text: text,
      read_at: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tmp]);
    try {
      const res = await fetch("/api/faction/chat/messages", {
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

  return (
    // Altura: viewport − header (~57px) − bottom nav (60px) − paddings do main.
    <div className="flex h-[calc(100dvh-180px)] flex-col rounded-2xl border border-border bg-card overflow-hidden">
      <ChatConversation
        title="Suporte LISION"
        messages={messages}
        mySide="FACTION"
        onSend={handleSend}
        sending={sending}
        uploadUrl="/api/faction/chat/upload"
        onUploaded={(m) => setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))}
      />
    </div>
  );
}

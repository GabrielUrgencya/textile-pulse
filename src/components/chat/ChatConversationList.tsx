"use client";

import * as React from "react";
import { Search } from "lucide-react";

export interface Conversation {
  factionId: string;
  name: string;
  photoUrl: string | null;
  lastMessage: {
    text: string | null;
    contentType: string;
    senderType: string;
    createdAt: string;
  } | null;
  unreadCount: number;
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function ChatConversationList({
  conversations,
  activeId,
  onSelect,
}: {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (factionId: string) => void;
}) {
  const [search, setSearch] = React.useState("");
  const filtered = conversations.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex h-full w-[320px] shrink-0 flex-col border-r border-border/60">
      {/* Busca */}
      <div className="p-3 border-b border-border/60">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar facção…"
            className="w-full h-9 rounded-lg border border-border/60 bg-secondary/30 pl-9 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring"
            aria-label="Buscar facção"
          />
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground text-center">Nenhuma facção encontrada.</p>
        )}
        {filtered.map((c) => (
          <button
            key={c.factionId}
            onClick={() => onSelect(c.factionId)}
            className={`flex w-full items-center gap-3 px-3 py-3 text-left transition-colors border-b border-border/30 ${
              activeId === c.factionId ? "bg-secondary/60" : "hover:bg-secondary/30"
            }`}
          >
            {c.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.photoUrl} alt="" className="size-12 shrink-0 rounded-full object-cover" />
            ) : (
              <div className="size-12 shrink-0 rounded-full bg-foreground text-background grid place-items-center text-sm font-semibold">
                {initials(c.name)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold">{c.name}</span>
                {c.lastMessage && (
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {timeLabel(c.lastMessage.createdAt)}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs text-muted-foreground">
                  {c.lastMessage
                    ? `${c.lastMessage.senderType === "ADMIN" ? "Você: " : ""}${c.lastMessage.text || "[mídia]"}`
                    : "Sem mensagens"}
                </span>
                {c.unreadCount > 0 && (
                  <span className="shrink-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-success px-1.5 text-[11px] font-bold text-success-foreground">
                    {c.unreadCount}
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

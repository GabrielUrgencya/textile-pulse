"use client";

import * as React from "react";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useNotifications, type NotificationItem } from "@/hooks/use-notifications";

const SEVERITY_DOT: Record<string, string> = {
  destructive: "bg-destructive",
  warning: "bg-warning",
  success: "bg-success",
  info: "bg-muted-foreground",
};

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  return new Date(dateStr).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function NotificationRow({ item }: { item: NotificationItem }) {
  const dot = SEVERITY_DOT[item.severity] || SEVERITY_DOT.info;

  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-border/30 last:border-0 hover:bg-secondary/30 transition">
      <div className={`size-2 rounded-full mt-1.5 shrink-0 ${dot}`} />
      <div className="flex-1 min-w-0">
        <div className="text-[12px] leading-relaxed">{item.message}</div>
        <div className="text-[10px] text-muted-foreground mt-0.5">{relativeTime(item.createdAt)}</div>
      </div>
    </div>
  );
}

export function NotificationBell() {
  const { items, unreadCount, markAllRead } = useNotifications();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative size-9 shrink-0 rounded-lg border border-border/60 bg-secondary/40 grid place-items-center text-muted-foreground hover:text-foreground hover:bg-secondary transition">
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 size-4 rounded-full bg-destructive text-[9px] font-bold text-white grid place-items-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[320px] p-0 max-h-[400px] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
          <span className="text-[13px] font-semibold">Notificações</span>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-6 text-[11px] text-muted-foreground" onClick={markAllRead}>
              Marcar todas como lidas
            </Button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-[12px] text-muted-foreground">
              Sem notificações
            </div>
          ) : (
            items.map((item) => <NotificationRow key={item.id} item={item} />)
          )}
        </div>
        <div className="px-4 py-2 border-t border-border/40 text-center">
          <span className="text-[11px] text-muted-foreground">Ver todas</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}

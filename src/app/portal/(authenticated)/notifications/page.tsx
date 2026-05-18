"use client";

import { useEffect, useState } from "react";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  severity: string;
  read_at: string | null;
  created_at: string;
}

export default function PortalNotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/faction/notifications")
      .then((r) => r.json())
      .then((data) => setNotifications(data.notifications || data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function markAsRead(ids: string[]) {
    try {
      await fetch("/api/faction/notifications/read", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      setNotifications((prev) =>
        prev.map((n) =>
          ids.includes(n.id) ? { ...n, read_at: new Date().toISOString() } : n
        )
      );
    } catch {
      // silent fail
    }
  }

  function markAllRead() {
    const unreadIds = notifications
      .filter((n) => !n.read_at)
      .map((n) => n.id);
    if (unreadIds.length > 0) markAsRead(unreadIds);
  }

  if (loading) return <LoadingSkeleton />;

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const SEVERITY_STYLES: Record<string, string> = {
    CRITICAL: "border-red-500/30 bg-red-500/5",
    WARNING: "border-amber-500/30 bg-amber-500/5",
    INFO: "border-border bg-card",
  };

  const SEVERITY_DOT: Record<string, string> = {
    CRITICAL: "bg-red-500",
    WARNING: "bg-amber-500",
    INFO: "bg-muted-foreground",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">
          Notificações
          {unreadCount > 0 && (
            <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">
              {unreadCount}
            </span>
          )}
        </h2>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Marcar todas como lidas
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">
          Nenhuma notificação.
        </p>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => !n.read_at && markAsRead([n.id])}
              className={`w-full rounded-lg border p-4 text-left transition-colors ${
                SEVERITY_STYLES[n.severity] || SEVERITY_STYLES.INFO
              } ${!n.read_at ? "ring-1 ring-primary/20" : "opacity-70"}`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    !n.read_at
                      ? SEVERITY_DOT[n.severity] || SEVERITY_DOT.INFO
                      : "bg-transparent"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{n.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {n.message}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground/60">
                    {new Date(n.created_at).toLocaleDateString("pt-BR")} ·{" "}
                    {new Date(n.created_at).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-6 w-36 animate-pulse rounded bg-muted" />
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  );
}

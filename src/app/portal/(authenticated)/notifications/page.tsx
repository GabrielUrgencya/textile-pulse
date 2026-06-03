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
      .then((data) => setNotifications(data.data || []))
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
        <h2 className="font-display text-[20px] font-semibold">
          Avisos
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

      {/* Summary KPIs — always visible */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-[13px] text-muted-foreground">Total</p>
          <p className="mt-1 font-display text-[28px] font-bold tabular-nums">{notifications.length}</p>
        </div>
        <div className={`rounded-2xl border p-4 ${unreadCount > 0 ? "border-primary/30 bg-primary/5" : "border-border bg-card"}`}>
          <p className="text-[13px] text-muted-foreground">Não lidas</p>
          <p className={`mt-1 font-display text-[28px] font-bold tabular-nums ${unreadCount > 0 ? "text-primary" : ""}`}>{unreadCount}</p>
        </div>
      </div>

      {notifications.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <svg className="h-6 w-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
            </svg>
          </div>
          <p className="text-[15px] font-medium">Nenhum aviso</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Avisos sobre suas remessas e prazos aparecerão aqui.
          </p>
        </div>
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

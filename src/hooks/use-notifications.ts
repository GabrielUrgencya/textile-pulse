"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  severity: string; // "info" | "warning" | "destructive" | "success"
  isRead: boolean;
  createdAt: string;
}

const POLL_MS = 60_000;

export function useNotifications() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?unread=true", { credentials: "same-origin" });
      if (!res.ok) return;
      const json = await res.json();
      const data = json.data as NotificationItem[];
      setItems(data);
      setUnreadCount(data.filter((n) => !n.isRead).length);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    intervalRef.current = setInterval(fetchNotifications, POLL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchNotifications]);

  const markAllRead = useCallback(async () => {
    try {
      await fetch("/api/notifications/read", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      // silent
    }
  }, []);

  const markRead = useCallback(async (ids: string[]) => {
    try {
      await fetch("/api/notifications/read", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      setItems((prev) =>
        prev.map((n) => (ids.includes(n.id) ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - ids.length));
    } catch {
      // silent
    }
  }, []);

  return { items, unreadCount, loading, markAllRead, markRead, refetch: fetchNotifications };
}

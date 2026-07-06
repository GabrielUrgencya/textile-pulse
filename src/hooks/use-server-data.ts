"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { showToast } from "@/lib/toast";

interface UseServerDataOptions {
  enabled?: boolean;
  /** Se definido, refaz o fetch a cada N ms em background (sem skeleton nem toast). */
  refreshMs?: number;
  /** Refaz o fetch (silencioso) quando a aba volta ao foco. */
  revalidateOnFocus?: boolean;
}

interface UseServerDataReturn<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useServerData<T>(
  url: string | null,
  options?: UseServerDataOptions,
): UseServerDataReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const enabled = options?.enabled ?? true;
  const refreshMs = options?.refreshMs;
  const revalidateOnFocus = options?.revalidateOnFocus ?? false;

  // silent=true: revalidação em background — não mostra skeleton nem toast.
  const fetchData = useCallback(async (silent = false) => {
    if (!url || !enabled) {
      setIsLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!silent) setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(url, { signal: controller.signal });

      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Erro ${res.status}`);
      }

      const json = await res.json();
      setData(json.data ?? json);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const message =
        err instanceof Error ? err.message : "Erro de conexao";
      setError(message);
      if (!silent) showToast("error", message);
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [url, enabled]);

  useEffect(() => {
    fetchData();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchData]);

  // Polling em background (tempo real).
  useEffect(() => {
    if (!url || !enabled || !refreshMs) return;
    const t = setInterval(() => fetchData(true), refreshMs);
    return () => clearInterval(t);
  }, [url, enabled, refreshMs, fetchData]);

  // Revalidação ao focar a aba.
  useEffect(() => {
    if (!url || !enabled || !revalidateOnFocus) return;
    const onFocus = () => fetchData(true);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [url, enabled, revalidateOnFocus, fetchData]);

  const publicRefetch = useCallback(() => fetchData(false), [fetchData]);

  return { data, isLoading, error, refetch: publicRefetch };
}

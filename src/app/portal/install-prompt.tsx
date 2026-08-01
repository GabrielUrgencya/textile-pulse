"use client";

import { useEffect, useState, useCallback } from "react";
import { BrandLogo } from "@/components/ui/brand-logo";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Register service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    // Safe localStorage helpers (Safari private mode, storage full, etc.)
    function safeGetItem(key: string): string | null {
      try { return localStorage.getItem(key); } catch { return null; }
    }
    function safeSetItem(key: string, value: string): void {
      try { localStorage.setItem(key, value); } catch { /* no-op */ }
    }

    // Count visits
    const visits = Number(safeGetItem("lision_portal_visits") || "0") + 1;
    safeSetItem("lision_portal_visits", String(visits));

    // Don't show if already dismissed or installed
    if (safeGetItem("lision_pwa_dismissed")) return;

    // Only show after 2nd visit
    if (visits < 2) return;

    function handlePrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowBanner(true);
    }

    window.addEventListener("beforeinstallprompt", handlePrompt);
    return () => window.removeEventListener("beforeinstallprompt", handlePrompt);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setShowBanner(false);
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setShowBanner(false);
    try { localStorage.setItem("lision_pwa_dismissed", "1"); } catch { /* no-op */ }
  }, []);

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 animate-in slide-in-from-bottom-4 rounded-lg border border-border bg-card p-4 shadow-lg">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-foreground/5">
          <BrandLogo variant="symbol" className="h-6 w-auto" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold">Adicionar à tela inicial</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Deixe o Portal da Facção como um atalho no seu celular.
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={handleInstall}
          className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          Adicionar
        </button>
        <button
          onClick={handleDismiss}
          className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground"
        >
          Agora não
        </button>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Count visits
    const visits = Number(localStorage.getItem("lision_portal_visits") || "0") + 1;
    localStorage.setItem("lision_portal_visits", String(visits));

    // Don't show if already dismissed or installed
    if (localStorage.getItem("lision_pwa_dismissed")) return;

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
    localStorage.setItem("lision_pwa_dismissed", "1");
  }, []);

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 animate-in slide-in-from-bottom-4 rounded-lg border border-border bg-card p-4 shadow-lg">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-lg">
          L
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold">Instalar LISION</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Adicione à tela inicial para acesso rápido.
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={handleInstall}
          className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          Instalar
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

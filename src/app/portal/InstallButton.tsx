"use client";

import { useEffect, useState, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Botão de "instalar app" na TELA DE LOGIN do portal da facção.
 *
 * Diferente do banner InstallPrompt (que só aparece na 2ª visita), este é
 * explícito e aparece já no PRIMEIRO acesso — o dono pediu que a facção
 * consiga instalar o portal na tela inicial logo de cara.
 *
 * - Android/Chrome: usa o evento beforeinstallprompt (instalação nativa).
 * - iOS/Safari: não há API de instalação; mostra a instrução Compartilhar →
 *   "Adicionar à Tela de Início".
 * - Já instalado (display-mode: standalone): não mostra nada.
 */
export function InstallButton() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [standalone, setStandalone] = useState(true); // assume instalado até provar o contrário (evita flash)
  const [showIOSHint, setShowIOSHint] = useState(false);

  useEffect(() => {
    // Já rodando como app instalado? Então não oferecer instalação.
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari expõe navigator.standalone
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setStandalone(isStandalone);
    if (isStandalone) return;

    // Detecta iOS (iPhone/iPad) — sem beforeinstallprompt.
    const ua = window.navigator.userAgent;
    const iOS = /iphone|ipad|ipod/i.test(ua);
    setIsIOS(iOS);

    function handlePrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", handlePrompt);
    return () => window.removeEventListener("beforeinstallprompt", handlePrompt);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  if (standalone) return null;

  // iOS: botão que revela a instrução (não há prompt programático)
  if (isIOS) {
    return (
      <div className="text-center">
        <button
          type="button"
          onClick={() => setShowIOSHint((v) => !v)}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <DownloadIcon />
          Instalar na tela inicial
        </button>
        {showIOSHint && (
          <p className="mt-3 rounded-lg border border-border bg-card px-4 py-3 text-xs leading-relaxed text-muted-foreground">
            No iPhone/iPad: toque em <span className="font-semibold">Compartilhar</span> na
            barra do navegador e depois em{" "}
            <span className="font-semibold">&ldquo;Adicionar à Tela de Início&rdquo;</span>.
          </p>
        )}
      </div>
    );
  }

  // Android/Chrome: só mostra quando o navegador sinalizou que dá para instalar
  if (!deferredPrompt) return null;

  return (
    <div className="text-center">
      <button
        type="button"
        onClick={handleInstall}
        className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <DownloadIcon />
        Instalar aplicativo
      </button>
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

"use client";

import * as React from "react";
import { Maximize, Minimize } from "lucide-react";

/**
 * Story 8.31 — Botão Fullscreen para a tela de TV.
 * Usa a Fullscreen API (com fallback webkit). Auto-hide após 3s ocioso
 * quando em fullscreen; reaparece ao mover o cursor / tocar a tela.
 */
type FsDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void>;
};
type FsElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void>;
};

export function FullscreenButton() {
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [visible, setVisible] = React.useState(true);
  const idleTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    const doc = document as FsDocument;
    const onChange = () =>
      setIsFullscreen(!!(document.fullscreenElement || doc.webkitFullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);

  // Auto-hide do botão somente em fullscreen
  React.useEffect(() => {
    if (!isFullscreen) {
      setVisible(true);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      return;
    }
    const armHide = () => {
      setVisible(true);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => setVisible(false), 3000);
    };
    armHide();
    window.addEventListener("mousemove", armHide);
    window.addEventListener("touchstart", armHide);
    return () => {
      window.removeEventListener("mousemove", armHide);
      window.removeEventListener("touchstart", armHide);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [isFullscreen]);

  const toggle = React.useCallback(async () => {
    const doc = document as FsDocument;
    const el = document.documentElement as FsElement;
    try {
      if (!document.fullscreenElement && !doc.webkitFullscreenElement) {
        if (el.requestFullscreen) await el.requestFullscreen();
        else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
      } else {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
      }
    } catch {
      /* navegador pode bloquear sem gesto — ignora silenciosamente */
    }
  }, []);

  return (
    <button
      onClick={toggle}
      aria-label={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
      title={isFullscreen ? "Sair da tela cheia (ESC)" : "Tela cheia"}
      className={`fixed top-3 right-3 z-50 size-10 rounded-lg bg-foreground/10 hover:bg-foreground/20 border border-border/40 backdrop-blur grid place-items-center text-foreground/80 hover:text-foreground transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      {isFullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
    </button>
  );
}

"use client";

import * as React from "react";

/**
 * Pull-to-refresh leve para as listas do portal (F4 — padrão mobile nativo).
 * No topo da página, arrastar para baixo >70px dispara onRefresh (spinner até
 * a promise resolver). Sem dependências.
 */
export function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => Promise<unknown> | void;
  children: React.ReactNode;
}) {
  const [pull, setPull] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);
  const startY = React.useRef<number | null>(null);
  const THRESHOLD = 70;

  const onTouchStart = (e: React.TouchEvent) => {
    // Só inicia se a página está no topo (senão é scroll normal).
    if (window.scrollY <= 0 && !refreshing) {
      startY.current = e.touches[0].clientY;
    } else {
      startY.current = null;
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current == null || refreshing) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0 && window.scrollY <= 0) {
      // Resistência: metade do arrasto, teto de 110px.
      setPull(Math.min(delta / 2, 110));
    }
  };

  const onTouchEnd = async () => {
    if (startY.current == null) return;
    const shouldRefresh = pull >= THRESHOLD;
    startY.current = null;
    if (shouldRefresh && !refreshing) {
      setRefreshing(true);
      setPull(48);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPull(0);
      }
    } else {
      setPull(0);
    }
  };

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      {/* Indicador */}
      <div
        className="flex items-center justify-center overflow-hidden transition-[height] duration-150"
        style={{ height: pull > 0 ? pull : 0 }}
        aria-hidden="true"
      >
        <span
          className={`size-6 rounded-full border-2 border-muted-foreground/40 border-t-foreground ${
            refreshing ? "animate-spin" : ""
          }`}
          style={!refreshing ? { transform: `rotate(${pull * 3}deg)` } : undefined}
        />
      </div>
      {children}
    </div>
  );
}

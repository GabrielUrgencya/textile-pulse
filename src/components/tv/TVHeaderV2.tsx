"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { TVSectorSelector, type SectorOption } from "@/components/tv/TVSectorSelector";

/**
 * Story 8.40 + refino Premium — Header da TV (Dashboards 2.0).
 * Nome do setor grande · seletor de setor por DROPDOWN elegante (sem fileira de
 * pills) · relógio HH:MM monospace · data · status de conexão (dot animado).
 */
export function TVHeaderV2({
  tokenName,
  sectors,
  activeId,
  onSelect,
  activeName,
  connected,
}: {
  tokenName: string;
  sectors: SectorOption[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
  activeName: string;
  connected: boolean;
}) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const dateStr = now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

  return (
    <header className="shrink-0 px-6 pt-4 pb-3 border-b border-border">
      <div className="flex items-end justify-between gap-4">
        {/* Esquerda: marca + nome do setor grande + dropdown de setor */}
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-[15px] font-semibold tracking-tight">LISION</span>
            <span className="text-[10px] text-muted-foreground/50">· {tokenName}</span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 min-w-0">
            <h1 className="font-display font-bold tracking-tight text-[clamp(1.75rem,3vw,2.5rem)] leading-tight truncate">
              {activeName}
            </h1>
            {/* Dropdown elegante substitui a antiga fileira de pills */}
            <TVSectorSelector sectors={sectors} activeId={activeId} onChange={onSelect} />
          </div>
        </div>

        {/* Direita: status + relógio + data */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="relative flex size-2">
                {connected && <span className="absolute inline-flex h-full w-full rounded-full bg-success/60 animate-ping" />}
                <span className={cn("relative inline-flex size-2 rounded-full", connected ? "bg-success" : "bg-destructive")} />
              </span>
              <span className={cn("text-[10px] uppercase tracking-wider font-medium", connected ? "text-success/80" : "text-destructive/80")}>
                {connected ? "Ao vivo" : "Reconectando"}
              </span>
            </span>
            <time className="font-mono text-[28px] tabular-nums font-semibold leading-none">
              {hh}<span className="animate-pulse">:</span>{mm}
            </time>
          </div>
          <span className="text-[12px] text-muted-foreground capitalize">{dateStr}</span>
        </div>
      </div>
    </header>
  );
}

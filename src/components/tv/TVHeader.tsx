"use client";

import { BrandLogo } from "@/components/ui/brand-logo";
import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { ShiftIndicator } from "@/components/tv/ShiftIndicator";

interface FactionMini {
  id: string;
  name: string;
  initials: string;
  score: number;
}

interface TVHeaderProps {
  tokenName: string;
  shiftStart: string;
  shiftEnd: string;
  activeShift?: string | null;
  recentActivity: Array<{
    barcode: string;
    stage_name: string;
    operator_name: string;
    scanned_at: string;
  }>;
  factionRanking?: FactionMini[];
}

export function TVHeader({
  tokenName,
  shiftStart,
  shiftEnd,
  activeShift,
  recentActivity,
  factionRanking = [],
}: TVHeaderProps) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const clockStr = time.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const tickerItems = recentActivity.map((a) => {
    const t = new Date(a.scanned_at);
    const timeStr = t.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return `${a.barcode} → ${a.stage_name} por ${a.operator_name} às ${timeStr}`;
  });

  const tickerContent = tickerItems.length > 0 ? tickerItems : ["Aguardando atividade..."];
  const doubled = [...tickerContent, ...tickerContent];

  return (
    <header className="shrink-0 h-10 flex items-center px-5 bg-background/90 border-b border-border/40">
      {/* Left — Logo */}
      <div className="flex items-center gap-2 shrink-0">
        <BrandLogo className="h-4 w-auto" />
        <span className="text-[10px] text-muted-foreground/50">· {tokenName}</span>
      </div>

      {/* Center — Ticker (fills available space) */}
      <div className="flex-1 mx-4 overflow-hidden">
        <div className="ticker-track">
          {doubled.map((item, i) => (
            <span
              key={i}
              className="font-mono text-[12px] tabular-nums text-muted-foreground/50 whitespace-nowrap px-5"
            >
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* Right — Ranking, shift, live indicator, clock */}
      <div className="flex items-center gap-4 shrink-0">
        {/* Mini ranking */}
        {factionRanking.length > 0 && (
          <div className="flex items-center gap-2">
            <Trophy className="size-3 text-warning/60" />
            {factionRanking.slice(0, 3).map((f, i) => (
              <span key={f.id} className="text-[10px] text-muted-foreground/60">
                {i + 1}. {f.initials} <span className="font-mono tabular-nums">{f.score}</span>
              </span>
            ))}
          </div>
        )}

        {activeShift ? (
          <ShiftIndicator shiftName={activeShift} />
        ) : (
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground/50">
            {shiftStart}–{shiftEnd}
          </span>
        )}

        <div className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-success animate-pulse-dot" />
          <span className="text-[8px] uppercase tracking-wider text-success/80 font-medium">AO VIVO</span>
        </div>

        <time className="font-mono text-[18px] tabular-nums font-medium">{clockStr}</time>
      </div>
    </header>
  );
}

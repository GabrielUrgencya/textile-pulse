"use client";

import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Bell, Menu, Search, Settings } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { BrandLogo } from "@/components/ui/brand-logo";

/* ─────────────────────── Types ─────────────────────── */

export interface TickerItem {
  label: string;
  value: string;
  trend?: number;
}

interface TopBarProps {
  ticker?: TickerItem[];
  showSearch?: boolean;
  showClock?: boolean;
}

/* ─────────────────────── Trend ─────────────────────── */

export function Trend({ value, suffix = "%" }: { value: number; suffix?: string }) {
  if (value === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground font-mono">
        —
      </span>
    );
  }
  const positive = value > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-mono font-medium ${
        positive ? "text-success" : "text-destructive"
      }`}
    >
      {positive ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {Math.abs(value).toFixed(1)}
      {suffix}
    </span>
  );
}

/* ─────────────────────── TopBar ─────────────────────── */

export function TopBar({ ticker, showSearch = true, showClock = true }: TopBarProps) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const time = now?.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) ?? "--:--:--";
  const date = now?.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }) ?? "";

  return (
    <header className="sticky top-0 z-30 backdrop-blur-xl bg-background/70 border-b border-border/60">
      <div className="flex items-center gap-6 px-6 lg:px-10 h-16">
        <SidebarTrigger className="md:hidden -ml-2 size-9 rounded-lg bg-secondary/60 border border-border/60 text-muted-foreground hover:text-foreground">
          <Menu className="size-4" />
        </SidebarTrigger>

        <div className="flex items-center">
          <div className="leading-tight">
            <BrandLogo className="h-6 w-auto" />
            <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Rastreamento Têxtil
            </div>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {showSearch && (
            <div className="hidden lg:flex items-center gap-2 px-3 h-9 rounded-lg bg-secondary/60 border border-border/60 text-sm text-muted-foreground w-72">
              <Search className="size-4" />
              <span className="flex-1">Pesquisar lotes, OPs, operadores…</span>
              <kbd className="text-[10px] font-mono bg-background/60 border border-border px-1.5 py-0.5 rounded">
                ⌘K
              </kbd>
            </div>
          )}

          {showClock && (
            <div className="hidden md:flex items-center gap-2 text-right leading-tight">
              <div className="text-right">
                <div className="font-mono text-sm tabular-nums" suppressHydrationWarning>
                  {time}
                </div>
                <div
                  className="text-[10px] uppercase tracking-wider text-muted-foreground capitalize"
                  suppressHydrationWarning
                >
                  {date}
                </div>
              </div>
            </div>
          )}

          <button className="size-9 rounded-lg bg-secondary/60 border border-border/60 grid place-items-center hover:bg-secondary transition">
            <Bell className="size-4" />
          </button>
          <button className="size-9 rounded-lg bg-secondary/60 border border-border/60 grid place-items-center hover:bg-secondary transition">
            <Settings className="size-4" />
          </button>
          <div className="size-9 rounded-lg bg-foreground text-background grid place-items-center font-semibold text-sm">
            JM
          </div>
        </div>
      </div>

      {/* Ticker */}
      {ticker && ticker.length > 0 && (
        <div className="flex items-center gap-8 px-6 lg:px-10 h-10 border-t border-border/60 overflow-x-auto text-[12px]">
          {ticker.map((t) => (
            <div key={t.label} className="flex items-center gap-2 whitespace-nowrap shrink-0">
              <span className="text-muted-foreground uppercase tracking-wider text-[10px]">
                {t.label}
              </span>
              <span className="font-mono tabular-nums font-medium">{t.value}</span>
              {t.trend != null && t.trend !== 0 && <Trend value={t.trend} />}
            </div>
          ))}
        </div>
      )}
    </header>
  );
}

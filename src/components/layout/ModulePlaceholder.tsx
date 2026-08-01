"use client";

import type { ReactNode } from "react";
import { Menu } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { BrandLogo } from "@/components/ui/brand-logo";

export function ModulePlaceholder({
  title,
  icon,
}: {
  title: string;
  icon: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground relative">
      <div className="fixed inset-0 bg-grid opacity-30 pointer-events-none" />
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-background/70 border-b border-border/60">
        <div className="flex items-center gap-3 px-6 lg:px-10 h-16">
          <SidebarTrigger className="md:hidden -ml-2 size-9 rounded-lg bg-secondary/60 border border-border/60 text-muted-foreground hover:text-foreground">
            <Menu className="size-4" />
          </SidebarTrigger>
          <div className="leading-tight">
            <BrandLogo className="h-6 w-auto" />
            <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Rastreamento Têxtil
            </div>
          </div>
        </div>
      </header>

      <main className="relative px-6 lg:px-10 py-16 max-w-[1600px] mx-auto">
        <div className="flex flex-col items-center justify-center text-center py-24">
          {icon}
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground mb-2">
            Módulo
          </div>
          <h1 className="font-display text-[36px] font-semibold tracking-tight leading-none mb-3">
            {title}
          </h1>
          <p className="text-muted-foreground text-[14px]">Em desenvolvimento</p>
        </div>
      </main>
    </div>
  );
}
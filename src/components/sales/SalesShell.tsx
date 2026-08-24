"use client";

import type { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { SalesSidebar } from "@/components/sales/SalesSidebar";
import type { SalesRole } from "@/lib/sales-access";

/**
 * Casca do LISION Vendas — mesma estrutura do AppShell do Lision principal:
 * SidebarProvider + sidebar lateral + <main>. Antes era um header horizontal;
 * agora reusa os primitivos shadcn (@/components/ui/sidebar) para paridade
 * visual total com o produto principal.
 */
export function SalesShell({ role, children }: { role: SalesRole; children: ReactNode }) {
  return (
    <SidebarProvider
      defaultOpen
      style={
        {
          "--sidebar-width": "280px",
          "--sidebar-width-icon": "64px",
        } as React.CSSProperties
      }
    >
      <div className="flex min-h-screen w-full bg-background text-foreground">
        <a
          href="#sales-content"
          className="sr-only z-[60] rounded-md bg-primary px-4 py-3 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Pular para o conteúdo
        </a>
        <SalesSidebar role={role} />
        <main id="sales-content" tabIndex={-1} className="flex-1 min-w-0 outline-none">
          {/* Toggle da sidebar no mobile — mesmo componente do shadcn. */}
          <div className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-border/60 bg-background/95 px-4 backdrop-blur md:hidden">
            <SidebarTrigger />
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Vendas
            </span>
          </div>
          <div className="px-4 py-8 md:px-8 md:py-10">{children}</div>
        </main>
      </div>
    </SidebarProvider>
  );
}

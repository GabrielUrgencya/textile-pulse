"use client";

import { useEffect, useState } from "react";
import { ShoppingBag } from "lucide-react";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

interface SalesAccessResponse {
  enabled?: boolean;
  home?: string | null;
}

export function SalesSidebarLink({ collapsed }: { collapsed: boolean }) {
  const [home, setHome] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadAccess() {
      try {
        const response = await fetch("/api/vendas/access", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;

        const access = (await response.json()) as SalesAccessResponse;
        if (
          access.enabled === true &&
          (access.home === "/vendas/admin" || access.home === "/vendas/app")
        ) {
          setHome(access.home);
        }
      } catch {
        // Fail closed: ausência, erro ou cancelamento nunca revelam o atalho.
      }
    }

    void loadAccess();
    return () => controller.abort();
  }, []);

  if (!home) return null;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        tooltip="Abrir LISION Vendas"
        className="h-9 rounded-md px-3 text-[13px] text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
      >
        <a href={home} target="_blank" rel="noopener noreferrer">
          <ShoppingBag className="size-4 shrink-0" aria-hidden />
          {!collapsed && <span>Vendas ↗</span>}
        </a>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

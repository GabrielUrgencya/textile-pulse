"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

interface SalesAccessResponse {
  enabled?: boolean;
  home?: string | null;
}

/**
 * Módulo "LISION Vendas" no app principal. A sessão é compartilhada, então basta
 * um clique: se o usuário tem vínculo ativo no Vendas, vai direto para a área dele
 * (/vendas/admin ou /vendas/app); se não tem, vai para a página de login do Vendas
 * (para entrar com outra conta que tenha acesso). Sem atrito, sem nova aba.
 */
export function SalesSidebarLink({ collapsed }: { collapsed: boolean }) {
  // Enquanto resolve, aponta para /vendas (o roteamento do módulo decide o destino).
  const [href, setHref] = useState<string>("/vendas");

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch("/api/vendas/access", { cache: "no-store", signal: controller.signal });
        if (!response.ok) { setHref("/vendas/login"); return; }
        const access = (await response.json()) as SalesAccessResponse;
        setHref(
          access.enabled === true && (access.home === "/vendas/admin" || access.home === "/vendas/app")
            ? access.home
            : "/vendas/login",
        );
      } catch {
        // Erro/cancelamento: mantém /vendas (o módulo resolve o acesso do lado de lá).
      }
    })();
    return () => controller.abort();
  }, []);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        tooltip="LISION Vendas"
        className="h-9 rounded-md px-3 text-[13px] text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
      >
        <Link href={href} prefetch={false}>
          <ShoppingBag className="size-4 shrink-0" aria-hidden />
          {!collapsed && <span>LISION Vendas</span>}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  CalendarRange,
  ChevronsLeft,
  CreditCard,
  LayoutDashboard,
  Lock,
  LogOut,
  Receipt,
  Settings,
  Target,
  Trophy,
  Tv,
  Users,
} from "lucide-react";
import { BrandLogo } from "@/components/ui/brand-logo";
import { useUserProfile } from "@/hooks/use-user-profile";
import type { SalesRole } from "@/lib/sales-access";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type Item = { title: string; url: string; icon: React.ReactNode; external?: boolean };

const cls = "size-4 shrink-0";
const ADMIN_ITEMS: Item[] = [
  { title: "Dashboard", url: "/vendas/admin", icon: <LayoutDashboard className={cls} /> },
  { title: "Vendas", url: "/vendas/admin/vendas", icon: <Receipt className={cls} /> },
  { title: "Equipe", url: "/vendas/admin/equipe", icon: <Users className={cls} /> },
  { title: "Métodos de pagamento", url: "/vendas/admin/metodos-pagamento", icon: <CreditCard className={cls} /> },
  { title: "Metas e comissões", url: "/vendas/admin/metas", icon: <Target className={cls} /> },
  { title: "Períodos", url: "/vendas/admin/periodos", icon: <CalendarRange className={cls} /> },
  { title: "Calendário", url: "/vendas/admin/calendario", icon: <CalendarDays className={cls} /> },
  { title: "Fechamento", url: "/vendas/admin/fechamento", icon: <Lock className={cls} /> },
  { title: "Painel TV", url: "/vendas/painel", icon: <Tv className={cls} />, external: true },
  { title: "Acesso da TV", url: "/vendas/admin/tv", icon: <Tv className={cls} /> },
  { title: "Configurações", url: "/vendas/admin/configuracoes", icon: <Settings className={cls} /> },
];
const ADMIN_BOTTOM: Item[] = [
  { title: "Coletivo", url: "/vendas/coletivo", icon: <Trophy className={cls} /> },
];
const CONSULTANT_ITEMS: Item[] = [
  { title: "Minha área", url: "/vendas/app", icon: <LayoutDashboard className={cls} /> },
  { title: "Coletivo", url: "/vendas/coletivo", icon: <Trophy className={cls} /> },
];

export function SalesSidebar({ role }: { role: SalesRole }) {
  const pathname = usePathname() ?? "/vendas";
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const { profile } = useUserProfile();
  const [loggingOut, setLoggingOut] = useState(false);

  const mainItems = role === "ADMIN" ? ADMIN_ITEMS : CONSULTANT_ITEMS;
  const bottomItems = role === "ADMIN" ? ADMIN_BOTTOM : [];

  const isActive = (url: string) =>
    url === "/vendas/admin" || url === "/vendas/app"
      ? pathname === url
      : pathname === url || pathname.startsWith(`${url}/`);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/login";
    } catch {
      setLoggingOut(false);
    }
  }

  return (
    <Sidebar collapsible="icon" className="border-r border-border/60 bg-background">
      <SidebarHeader className="px-3 pt-4 pb-3">
        <Link href="/vendas" className="flex items-center gap-2.5 px-1.5">
          {collapsed ? (
            <BrandLogo variant="symbol" className="size-8 shrink-0" />
          ) : (
            <div className="leading-tight overflow-hidden">
              <BrandLogo className="h-6 w-auto" priority />
              <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-muted-foreground truncate">
                Vendas
              </div>
            </div>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {mainItems.map((item) => (
                <NavLink key={item.url} item={item} active={isActive(item.url)} collapsed={collapsed} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {bottomItems.length > 0 && (
          <>
            <SidebarSeparator className="my-2 bg-border/60" />
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
                  {bottomItems.map((item) => (
                    <NavLink key={item.url} item={item} active={isActive(item.url)} collapsed={collapsed} />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      <div className="px-3 pb-1">
        <button
          onClick={toggleSidebar}
          className="w-full h-8 flex items-center justify-center gap-2 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-secondary/60 transition-colors"
          aria-label={collapsed ? "Expandir sidebar" : "Recolher sidebar"}
        >
          <ChevronsLeft className={cn("size-4 transition-transform duration-200", collapsed && "rotate-180")} />
          {!collapsed && <span className="text-[11px] tracking-wide">Recolher</span>}
        </button>
      </div>

      <SidebarFooter className="p-3 border-t border-border/60">
        {/* Voltar ao LISION principal — mesma malha visual dos itens de navegação. */}
        <Link
          href="/dashboard"
          className={cn(
            "flex items-center gap-2 h-9 px-3 rounded-md text-[13px] text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors",
            collapsed && "justify-center px-0",
          )}
        >
          <ArrowLeft className="size-4 shrink-0" />
          {!collapsed && <span>Voltar ao LISION</span>}
        </Link>

        <div className={cn("mt-2 flex items-center gap-3 pt-2 border-t border-border/60", collapsed && "justify-center")}>
          <div className="size-9 shrink-0 rounded-lg bg-foreground text-background grid place-items-center font-semibold text-sm">
            {profile?.initials || "?"}
          </div>
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0 leading-tight">
                <div className="text-[13px] font-medium truncate">{profile?.fullName || "Carregando..."}</div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground truncate">
                  {role === "ADMIN" ? "Admin · Vendas" : "Consultor · Vendas"}
                </div>
              </div>
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="size-8 shrink-0 rounded-md border border-border/60 bg-secondary/40 grid place-items-center text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-50 transition"
                aria-label="Sair"
              >
                <LogOut className="size-4" />
              </button>
            </>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function NavLink({ item, active, collapsed }: { item: Item; active: boolean; collapsed: boolean }) {
  return (
    <SidebarMenuItem className="relative">
      <SidebarMenuButton
        asChild
        tooltip={item.title}
        className={cn(
          "h-9 px-3 rounded-md text-[13px] transition-colors",
          active
            ? "bg-foreground text-background font-medium hover:bg-foreground hover:text-background data-[active=true]:bg-foreground data-[active=true]:text-background"
            : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
        )}
        isActive={active}
      >
        {item.external ? (
          <a href={item.url} target="_blank" rel="noopener noreferrer">
            {item.icon}
            {!collapsed && <span>{item.title}</span>}
          </a>
        ) : (
          <Link href={item.url} prefetch>
            {item.icon}
            {!collapsed && <span>{item.title}</span>}
          </Link>
        )}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

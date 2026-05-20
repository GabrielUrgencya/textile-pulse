"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  Factory,
  LayoutDashboard,
  LogOut,
  ScanLine,
  Settings,
  ShieldCheck,
  Truck,
  Users,
} from "lucide-react";

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

const mainItems = [
  { title: "Dashboard", url: "/dashboard", icon: <LayoutDashboard className="size-4 shrink-0" /> },
  { title: "Produção", url: "/production/orders", icon: <Factory className="size-4 shrink-0" /> },
  { title: "Scan", url: "/scan", icon: <ScanLine className="size-4 shrink-0" /> },
  { title: "Retrabalho", url: "/rework", icon: <AlertTriangle className="size-4 shrink-0" /> },
  { title: "Qualidade", url: "/quality", icon: <ShieldCheck className="size-4 shrink-0" /> },
  { title: "Facções", url: "/factions", icon: <Truck className="size-4 shrink-0" /> },
  { title: "Equipe", url: "/team", icon: <Users className="size-4 shrink-0" /> },
];

const bottomItems = [
  { title: "Configurações", url: "/settings", icon: <Settings className="size-4 shrink-0" /> },
];

export function AppSidebar() {
  const pathname = usePathname() ?? "/dashboard";
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const [loggingOut, setLoggingOut] = useState(false);

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

  const isActive = (url: string) =>
    url === "/dashboard" ? pathname === url : pathname.startsWith(url);

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-border/60 bg-background"
    >
      <SidebarHeader className="px-3 pt-4 pb-3">
        <Link href="/dashboard" className="flex items-center gap-3 px-1.5">
          <div className="size-9 shrink-0 rounded-lg bg-foreground text-background grid place-items-center font-display text-[15px] font-semibold">
            L
          </div>
          {!collapsed && (
            <div className="leading-tight overflow-hidden">
              <div className="font-display text-xl">LISION</div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground -mt-0.5 truncate">
                Rastreamento Têxtil
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
                <NavLink
                  key={item.url}
                  item={item}
                  active={isActive(item.url)}
                  collapsed={collapsed}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator className="my-2 bg-border/60" />

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {bottomItems.map((item) => (
                <NavLink
                  key={item.url}
                  item={item}
                  active={isActive(item.url)}
                  collapsed={collapsed}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-border/60">
        <div
          className={cn(
            "flex items-center gap-3",
            collapsed && "justify-center",
          )}
        >
          <div className="size-9 shrink-0 rounded-lg bg-foreground text-background grid place-items-center font-semibold text-sm">
            JM
          </div>
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0 leading-tight">
                <div className="text-[13px] font-medium truncate">
                  Jonatas Mendes
                </div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground truncate">
                  Admin · Produção
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

function NavLink({
  item,
  active,
  collapsed,
}: {
  item: { title: string; url: string; icon: React.ReactNode };
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <SidebarMenuItem>
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
        <Link href={item.url} prefetch>
          {item.icon}
          {!collapsed && <span>{item.title}</span>}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
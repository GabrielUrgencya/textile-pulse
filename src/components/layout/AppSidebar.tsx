"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUserProfile } from "@/hooks/use-user-profile";
import {
  AlertTriangle,
  CalendarDays,
  ChevronsLeft,
  ClipboardCheck,
  Clock,
  Factory,
  LayoutDashboard,
  LogOut,
  ScanLine,
  Settings,
  ShieldCheck,
  Trophy,
  Truck,
  Tv,
  Users,
} from "lucide-react";
import { showToast } from "@/lib/toast";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { usePermissions } from "@/hooks/use-permissions";

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
  { title: "Dashboard", url: "/dashboard", icon: <LayoutDashboard className="size-4 shrink-0" />, permission: "dashboard:view" },
  { title: "Produção", url: "/production/orders", icon: <Factory className="size-4 shrink-0" />, permission: "orders:view" },
  { title: "Plano do Dia", url: "/production/daily-plan", icon: <CalendarDays className="size-4 shrink-0" />, permission: "settings:manage" },
  { title: "Scan", url: "/scan", icon: <ScanLine className="size-4 shrink-0" />, permission: "scan:view" },
  { title: "Aduana", url: "/aduana", icon: <ClipboardCheck className="size-4 shrink-0" />, permission: "scan:view" },
  { title: "Expedição", url: "/expedition", icon: <Clock className="size-4 shrink-0" />, permission: "factions:view" },
  { title: "Retrabalho", url: "/rework", icon: <AlertTriangle className="size-4 shrink-0" />, permission: "rework:view" },
  { title: "Qualidade", url: "/quality", icon: <ShieldCheck className="size-4 shrink-0" />, permission: "quality:view" },
  { title: "Facções", url: "/factions", icon: <Truck className="size-4 shrink-0" />, permission: "factions:view" },
  { title: "Ranking", url: "/ranking", icon: <Trophy className="size-4 shrink-0" />, permission: "factions:view", adminOnly: true },
  { title: "Equipe", url: "/team", icon: <Users className="size-4 shrink-0" />, permission: "users:manage" },
];

const bottomItems = [
  { title: "Configurações", url: "/settings", icon: <Settings className="size-4 shrink-0" />, permission: "settings:manage" },
];

export function AppSidebar() {
  const pathname = usePathname() ?? "/dashboard";
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const [loggingOut, setLoggingOut] = useState(false);
  const [openingTv, setOpeningTv] = useState(false);
  const { profile } = useUserProfile();
  const { can: hasPerm, isLoading: permsLoading } = usePermissions();

  // Story 8.17: abre a TV usando/gerando um token kiosk (ADMIN only)
  const canOpenTv = profile?.role === "ADMIN";

  // Story 8.22: filter menu items by effective permissions
  // Story 8.33: itens adminOnly só aparecem para ADMIN
  const isAdmin = profile?.role === "ADMIN";
  const visibleMainItems = mainItems.filter((item) => {
    if ((item as { adminOnly?: boolean }).adminOnly) return isAdmin;
    return permsLoading ? true : hasPerm(item.permission);
  });
  const visibleBottomItems = permsLoading
    ? bottomItems
    : bottomItems.filter((item) => hasPerm(item.permission));

  async function handleOpenTv() {
    if (openingTv) return;
    setOpeningTv(true);
    try {
      let token: string | null = null;

      // Reusa um token de dashboard ativo, se houver
      const listRes = await fetch("/api/admin/kiosk-tokens");
      if (listRes.ok) {
        const { tokens } = await listRes.json();
        const active = (tokens || []).find(
          (t: { token: string; scope: string; is_active: boolean }) =>
            t.is_active && t.scope === "dashboard",
        );
        if (active) token = active.token;
      }

      // Senão, cria um novo
      if (!token) {
        const createRes = await fetch("/api/admin/kiosk-tokens", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "TV Painel", scope: "dashboard" }),
        });
        if (!createRes.ok) throw new Error();
        const { token: created } = await createRes.json();
        token = created.token;
      }

      if (!token) throw new Error();
      window.open(`/tv?token=${token}`, "_blank", "noopener");
    } catch {
      showToast("error", "Não foi possível abrir a TV");
    } finally {
      setOpeningTv(false);
    }
  }

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
              {visibleMainItems.map((item) => (
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
              {canOpenTv && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip="Abrir TV / Painel"
                    onClick={handleOpenTv}
                    disabled={openingTv}
                    className="h-9 px-3 rounded-md text-[13px] transition-colors text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                  >
                    <Tv className="size-4 shrink-0" />
                    {!collapsed && <span>{openingTv ? "Abrindo..." : "TV / Painel"}</span>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {visibleBottomItems.map((item) => (
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

      {/* Collapse/Expand toggle */}
      <div className="px-3 pb-1">
        <button
          onClick={toggleSidebar}
          className="w-full h-8 flex items-center justify-center gap-2 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-secondary/60 transition-colors"
          aria-label={collapsed ? "Expandir sidebar" : "Recolher sidebar"}
        >
          <ChevronsLeft
            className={cn(
              "size-4 transition-transform duration-200",
              collapsed && "rotate-180",
            )}
          />
          {!collapsed && (
            <span className="text-[11px] tracking-wide">Recolher</span>
          )}
        </button>
      </div>

      <SidebarFooter className="p-3 border-t border-border/60">
        <div
          className={cn(
            "flex items-center gap-3",
            collapsed && "justify-center",
          )}
        >
          <div className="size-9 shrink-0 rounded-lg bg-foreground text-background grid place-items-center font-semibold text-sm">
            {profile?.initials || "?"}
          </div>
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0 leading-tight">
                <div className="text-[13px] font-medium truncate">
                  {profile?.fullName || "Carregando..."}
                </div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground truncate">
                  {profile?.role || ""}
                </div>
              </div>
              <NotificationBell />
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
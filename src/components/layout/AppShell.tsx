"use client";

import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { FactionMessageNotifier } from "@/components/notifications/FactionMessageNotifier";
import { FactionUnreadProvider } from "@/components/notifications/FactionUnreadProvider";

export function AppShell({ children }: { children: React.ReactNode }) {
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
      {/* Fonte única das não lidas: alimenta o badge do Chat (sidebar) E o toast. */}
      <FactionUnreadProvider>
        <div className="flex min-h-screen w-full bg-background text-foreground">
          <AppSidebar />
          <main className="flex-1 min-w-0">{children}</main>
          {/* Notificação de facção: global, vale em qualquer aba do app. */}
          <FactionMessageNotifier />
        </div>
      </FactionUnreadProvider>
    </SidebarProvider>
  );
}
"use client";

import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";

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
      <div className="flex min-h-screen w-full bg-background text-foreground">
        <AppSidebar />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </SidebarProvider>
  );
}
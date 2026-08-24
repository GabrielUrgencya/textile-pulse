import type { SalesRole } from "@/lib/sales-access";

export interface SalesNavigationItem {
  label: string;
  href: string;
}

const SALES_NAVIGATION: Record<SalesRole, readonly SalesNavigationItem[]> = {
  ADMIN: [
    { label: "Admin", href: "/vendas/admin" },
    { label: "Coletivo", href: "/vendas/coletivo" },
    { label: "TV", href: "/vendas/tv" },
  ],
  CONSULTANT: [
    { label: "Minha área", href: "/vendas/app" },
    { label: "Coletivo", href: "/vendas/coletivo" },
  ],
};

export function getSalesNavigation(role: SalesRole): readonly SalesNavigationItem[] {
  return SALES_NAVIGATION[role];
}

export function isSalesNavigationItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

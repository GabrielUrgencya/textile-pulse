"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SalesRole } from "@/lib/sales-access";
import {
  getSalesNavigation,
  isSalesNavigationItemActive,
} from "@/lib/sales-navigation";
import { cn } from "@/lib/utils";

interface SalesNavigationProps {
  role: SalesRole;
  direction?: "horizontal" | "vertical";
  onNavigate?: () => void;
}

export function SalesNavigation({
  role,
  direction = "horizontal",
  onNavigate,
}: SalesNavigationProps) {
  const pathname = usePathname() ?? "/vendas";

  return (
    <nav aria-label="Navegação do LISION Vendas">
      <ul
        className={cn(
          "flex gap-1",
          direction === "vertical" ? "flex-col" : "items-center",
        )}
      >
        {getSalesNavigation(role).map((item) => {
          const active = isSalesNavigationItemActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={onNavigate}
                className={cn(
                  "flex min-h-11 items-center rounded-lg px-3 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

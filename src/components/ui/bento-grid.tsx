"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { WidgetSize } from "@/lib/dashboard-config";

/**
 * Story 8.39 — BentoGrid (Dashboards 2.0).
 * Grid 12-col, gap 16px. size→span: sm 3x2 / md 4x3 / lg 6x4 / xl 12x6.
 * mode="tv": altura cheia sem scroll (auto-rows densos). mode="responsive": colapsa em telas estreitas.
 */

const SIZE_SPAN: Record<WidgetSize, { col: number; row: number }> = {
  sm: { col: 3, row: 2 },
  md: { col: 4, row: 3 },
  lg: { col: 6, row: 4 },
  xl: { col: 12, row: 6 },
};

export function BentoGrid({
  children,
  mode = "responsive",
  className,
}: {
  children: React.ReactNode;
  mode?: "tv" | "responsive";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-12 gap-5",
        mode === "tv" ? "h-full auto-rows-[minmax(0,1fr)]" : "auto-rows-[minmax(110px,auto)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function BentoCell({
  size,
  children,
  className,
  style,
}: {
  size: WidgetSize;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const span = SIZE_SPAN[size];
  return (
    <div
      className={cn(
        "min-h-0 min-w-0",
        // responsivo: em telas estreitas, ocupa a largura toda
        "col-span-12",
        size === "sm" && "sm:col-span-6 lg:col-span-3",
        size === "md" && "sm:col-span-6 lg:col-span-4",
        size === "lg" && "lg:col-span-6",
        size === "xl" && "col-span-12",
        className,
      )}
      style={{ gridRow: `span ${span.row}`, ...style }}
    >
      {children}
    </div>
  );
}

export { SIZE_SPAN };

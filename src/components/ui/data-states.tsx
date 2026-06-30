"use client";

import * as React from "react";
import { Inbox, RotateCw, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Story 8.39 — estados de dados (Dashboards 2.0): Skeleton / Empty / Error.
 * Skeleton usa o shimmer já existente (.animate-shimmer, white-alpha).
 */

export function Skeleton({ className, rounded = "rounded-2xl" }: { className?: string; rounded?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden bg-foreground/[0.06] animate-shimmer",
        rounded,
        className,
      )}
      aria-hidden
    />
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center justify-center text-center gap-2 py-8 px-4",
        "rounded-2xl border border-dashed border-border/70 bg-background/30",
        className,
      )}
    >
      <div className="text-foreground/15">{icon ?? <Inbox className="size-8" strokeWidth={1.5} />}</div>
      <p className="text-[13px] font-medium text-muted-foreground">{title}</p>
      {description && <p className="text-[12px] text-muted-foreground/60 max-w-[42ch] leading-snug">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "Não foi possível carregar",
  description,
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center py-8 px-4", className)}>
      <AlertTriangle className="size-8 text-destructive/70 mb-2" />
      <p className="text-[14px] font-medium">{title}</p>
      {description && <p className="text-[13px] text-muted-foreground mt-1 max-w-[42ch]">{description}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-secondary/60 border border-border/50 hover:bg-secondary transition-colors text-[13px]"
        >
          <RotateCw className="size-3.5" /> Tentar novamente
        </button>
      )}
    </div>
  );
}

import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  className?: string;
}

function TableSkeleton({ rows = 5, columns = 4, className }: TableSkeletonProps) {
  return (
    <>
      {/* Desktop skeleton */}
      <div className={cn("hidden md:block", className)}>
        {/* Header */}
        <div className="flex gap-4 px-2 mb-3">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={`h-${i}`} className="h-4 flex-1 rounded" />
          ))}
        </div>
        {/* Rows */}
        {Array.from({ length: rows }).map((_, r) => (
          <div key={`r-${r}`} className="flex gap-4 px-2 py-3 border-b border-border/40">
            {Array.from({ length: columns }).map((_, c) => (
              <Skeleton
                key={`r-${r}-c-${c}`}
                className="h-4 flex-1 rounded"
                style={{ maxWidth: c === 0 ? "40%" : undefined }}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Mobile skeleton — 3 card skeletons */}
      <div className={cn("md:hidden space-y-3", className)}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={`m-${i}`}
            className="rounded-xl border border-border/40 bg-secondary/30 p-4 space-y-3"
          >
            <Skeleton className="h-4 w-3/4 rounded" />
            <Skeleton className="h-3 w-1/2 rounded" />
            <div className="flex gap-2">
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export { TableSkeleton };
export type { TableSkeletonProps };

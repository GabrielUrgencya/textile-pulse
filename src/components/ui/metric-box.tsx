import * as React from "react";
import { cn } from "@/lib/utils";

interface MetricBoxProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string;
  accent?: boolean;
}

function MetricBox({ label, value, accent = false, className, ...props }: MetricBoxProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/40 p-3",
        accent ? "bg-foreground text-background" : "bg-secondary/30",
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          "text-[10px] uppercase tracking-wider mb-1",
          accent ? "text-background/70" : "text-muted-foreground",
        )}
      >
        {label}
      </div>
      <div className="font-display text-[22px] font-semibold tabular-nums leading-none">
        {value}
      </div>
    </div>
  );
}

/* ── SubMetric: smaller inline metric (label + mono value) ── */

function SubMetric({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono text-sm tabular-nums mt-1">{value}</div>
    </div>
  );
}

export { MetricBox, SubMetric };
export type { MetricBoxProps };

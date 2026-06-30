"use client";

import { cn } from "@/lib/utils";

/**
 * Story 8.39 — ProgressBar (Dashboards 2.0).
 * Track + fill arredondados; transição cubic-bezier no width.
 * Cor por threshold: neutro (foreground) / warning / destructive — sem cor nova.
 */

type Tone = "neutral" | "warning" | "critical" | "success";

const FILL: Record<Tone, string> = {
  neutral: "bg-foreground",
  success: "bg-success",
  warning: "bg-warning",
  critical: "bg-destructive",
};

/** Resolve o tom a partir do percentual e dos thresholds (% da meta). */
export function toneFromPercent(percent: number, thresholds?: { warning: number; critical: number }): Tone {
  if (percent >= 100) return "success";
  if (!thresholds) return "neutral";
  if (percent < thresholds.critical) return "critical";
  if (percent < thresholds.warning) return "warning";
  return "neutral";
}

export function ProgressBar({
  value,
  max = 100,
  tone,
  thresholds,
  height = 6,
  glow = false,
  className,
}: {
  value: number;
  max?: number;
  tone?: Tone;
  thresholds?: { warning: number; critical: number };
  height?: number;
  glow?: boolean;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const resolved = tone ?? toneFromPercent(pct, thresholds);
  return (
    <div
      className={cn("w-full rounded-full bg-foreground/10 overflow-hidden", className)}
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)]", FILL[resolved])}
        style={{ width: `${pct}%`, boxShadow: glow ? "0 0 12px color-mix(in oklch, currentColor 40%, transparent)" : undefined }}
      />
    </div>
  );
}

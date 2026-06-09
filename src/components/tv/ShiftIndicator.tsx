"use client";

import { Sun, Moon } from "lucide-react";

interface ShiftIndicatorProps {
  shiftName: string | null;
}

export function ShiftIndicator({ shiftName }: ShiftIndicatorProps) {
  if (!shiftName) return null;

  const isMorning = shiftName.toLowerCase().includes("manh");
  const Icon = isMorning ? Sun : Moon;

  return (
    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 border border-accent/20">
      <Icon className="size-3 text-accent" />
      <span className="text-[10px] font-medium text-accent tracking-wide">
        {shiftName}
      </span>
    </div>
  );
}

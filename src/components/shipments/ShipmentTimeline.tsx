"use client";

import { cn } from "@/lib/utils";

const STEPS = [
  { key: "PENDING", label: "Preparando" },
  { key: "SENT", label: "Enviado" },
  { key: "RECEIVED", label: "Com Facção" },
  { key: "RETURNED", label: "Devolvido" },
] as const;

const STATUS_ORDER: Record<string, number> = {
  PENDING: 0,
  SENT: 1,
  RECEIVED: 2,
  LATE: 2, // same position as RECEIVED (still with faction)
  RETURNED: 3,
};

interface ShipmentTimelineProps {
  status: string;
  expectedReturn: string;
}

function getUrgencyColor(expectedReturn: string): "green" | "amber" | "red" {
  const now = new Date();
  const deadline = new Date(expectedReturn);
  const diffMs = deadline.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays > 2) return "green";
  if (diffDays >= 0) return "amber";
  return "red";
}

const urgencyStyles = {
  green: {
    circle: "bg-green-500 border-green-500",
    line: "bg-green-500",
    text: "text-green-500",
    pulse: "",
  },
  amber: {
    circle: "bg-amber-500 border-amber-500",
    line: "bg-amber-500",
    text: "text-amber-500",
    pulse: "",
  },
  red: {
    circle: "bg-red-500 border-red-500",
    line: "bg-red-500",
    text: "text-red-500",
    pulse: "animate-pulse",
  },
};

export function ShipmentTimeline({
  status,
  expectedReturn,
}: ShipmentTimelineProps) {
  const currentIndex = STATUS_ORDER[status] ?? 0;
  const urgency = getUrgencyColor(expectedReturn);
  const styles = urgencyStyles[urgency];
  const isDone = status === "RETURNED";

  return (
    <>
      {/* Horizontal (desktop) */}
      <div className="hidden md:flex items-center gap-0 w-full">
        {STEPS.map((step, i) => {
          const isPast = i < currentIndex;
          const isCurrent = i === currentIndex;
          const isFuture = i > currentIndex;

          return (
            <div key={step.key} className="flex items-center flex-1 last:flex-none">
              {/* Step circle + label */}
              <div className="flex flex-col items-center gap-1 relative">
                <div
                  className={cn(
                    "size-5 rounded-full border-2 flex items-center justify-center transition-all",
                    isPast && "bg-accent border-accent",
                    isCurrent && !isDone && cn("size-6", styles.circle, styles.pulse),
                    isCurrent && isDone && "bg-accent border-accent",
                    isFuture && "border-muted-foreground/30 bg-transparent"
                  )}
                >
                  {isPast && (
                    <svg className="size-3 text-accent-foreground" viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span
                  className={cn(
                    "text-[10px] whitespace-nowrap",
                    isPast && "text-muted-foreground",
                    isCurrent && !isDone && styles.text,
                    isCurrent && isDone && "text-muted-foreground",
                    isFuture && "text-muted-foreground/50"
                  )}
                >
                  {step.label}
                </span>
              </div>

              {/* Connecting line */}
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 flex-1 mx-1",
                    isPast ? "bg-accent" : "border-t border-dashed border-muted-foreground/30"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Vertical (mobile) */}
      <div className="flex md:hidden flex-col gap-0">
        {STEPS.map((step, i) => {
          const isPast = i < currentIndex;
          const isCurrent = i === currentIndex;
          const isFuture = i > currentIndex;

          return (
            <div key={step.key} className="flex items-start gap-3">
              {/* Circle + line column */}
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "size-4 rounded-full border-2 shrink-0",
                    isPast && "bg-accent border-accent",
                    isCurrent && !isDone && cn("size-5", styles.circle, styles.pulse),
                    isCurrent && isDone && "bg-accent border-accent",
                    isFuture && "border-muted-foreground/30 bg-transparent"
                  )}
                />
                {i < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "w-0.5 h-5",
                      isPast ? "bg-accent" : "border-l border-dashed border-muted-foreground/30"
                    )}
                  />
                )}
              </div>

              {/* Label */}
              <span
                className={cn(
                  "text-xs pt-0.5",
                  isPast && "text-muted-foreground",
                  isCurrent && !isDone && styles.text,
                  isCurrent && isDone && "text-muted-foreground",
                  isFuture && "text-muted-foreground/50"
                )}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

import * as React from "react";
import { cn } from "@/lib/utils";

/* ─────────────────────── LisionCard ─────────────────────── */

interface LisionCardProps extends React.HTMLAttributes<HTMLDivElement> {
  pad?: boolean;
}

const LisionCard = React.forwardRef<HTMLDivElement, LisionCardProps>(
  ({ className, pad = true, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        // SEM overflow-hidden: nunca clipar conteúdo (números display). Decoração interna
        // que precise clipar deve usar uma camada própria com overflow-hidden + rounded-[inherit].
        "relative rounded-2xl bg-card-gradient border border-border/60 border-gradient shadow-elegant",
        pad && "p-5",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  ),
);
LisionCard.displayName = "LisionCard";

/* ─────────────────────── LisionCardHeader ─────────────────────── */

interface LisionCardHeaderProps {
  eyebrow?: string;
  title: string;
  right?: React.ReactNode;
  className?: string;
}

function LisionCardHeader({ eyebrow, title, right, className }: LisionCardHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between mb-4", className)}>
      <div>
        {eyebrow && (
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80 mb-1.5 font-medium">
            {eyebrow}
          </div>
        )}
        <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
      </div>
      {right}
    </div>
  );
}

export { LisionCard, LisionCardHeader };
export type { LisionCardProps, LisionCardHeaderProps };

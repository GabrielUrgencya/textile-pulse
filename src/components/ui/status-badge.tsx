import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const statusBadgeVariants = cva(
  "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium whitespace-nowrap",
  {
    variants: {
      status: {
        success: "bg-success/10 text-success border-success/20",
        warning: "bg-warning/10 text-warning border-warning/20",
        destructive: "bg-destructive/10 text-destructive border-destructive/20",
        neutral: "bg-secondary text-muted-foreground border-border/40",
      },
      size: {
        sm: "text-[10px] px-1.5 py-0.5",
        md: "text-[11px] px-2 py-1",
      },
    },
    defaultVariants: {
      status: "neutral",
      size: "sm",
    },
  },
);

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusBadgeVariants> {
  icon?: React.ReactNode;
}

function StatusBadge({ className, status, size, icon, children, ...props }: StatusBadgeProps) {
  return (
    <span className={cn(statusBadgeVariants({ status, size }), className)} {...props}>
      {icon}
      {children}
    </span>
  );
}

export { StatusBadge, statusBadgeVariants };

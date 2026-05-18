"use client";

import * as React from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
  className?: string;
}

function PageHeader({ eyebrow, title, children, className }: PageHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("flex items-end justify-between mb-6", className)}
    >
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground mb-1">
          {eyebrow}
        </div>
        <h1 className="font-display text-[36px] lg:text-[44px] font-semibold tracking-tight leading-none">
          {title}
        </h1>
      </div>
      {children}
    </motion.div>
  );
}

export { PageHeader };
export type { PageHeaderProps };

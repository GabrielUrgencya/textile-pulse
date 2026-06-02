import * as React from "react";
import { cn } from "@/lib/utils";

interface FilterBarProps {
  children: React.ReactNode;
  className?: string;
}

function FilterBar({ children, className }: FilterBarProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 flex-wrap",
        "max-md:flex-col max-md:[&>*]:w-full",
        className,
      )}
    >
      {children}
    </div>
  );
}

export { FilterBar };
export type { FilterBarProps };

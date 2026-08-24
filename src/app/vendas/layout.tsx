import type { ReactNode } from "react";

export default function SalesLayout({ children }: { children: ReactNode }) {
  return <div className="sales-theme min-h-dvh bg-background text-foreground">{children}</div>;
}

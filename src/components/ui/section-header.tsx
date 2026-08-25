import { cn } from "@/lib/utils";

/**
 * Divisor de seção — rótulo discreto + linha. Extraído do padrão do dashboard
 * do Lision (Dashboard.tsx) para reúso no LISION Vendas e demais telas.
 */
export function SectionHeader({ label, className }: { label: string; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground/60">
        {label}
      </div>
      <div className="h-px flex-1 bg-border/40" />
    </div>
  );
}

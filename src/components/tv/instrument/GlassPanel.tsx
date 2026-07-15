import type { CSSProperties, ReactNode } from "react";

/**
 * Card de "vidro" premium da TV. Sem backdrop-filter (custo de GPU o dia todo
 * e o fundo é quase sólido): translúcido + borda edge-light + realce no topo
 * (::before via .border-gradient) + inset highlight. Reliable-first.
 */
export function GlassPanel({
  children,
  className = "",
  style,
  area,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  area?: string;
}) {
  return (
    <div
      className={`border-gradient relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.03] shadow-elegant ${className}`}
      style={{ gridArea: area, ...style }}
    >
      {children}
    </div>
  );
}

/** Label de card: CAIXA ALTA, letter-spacing, silenciado (hierarquia do mockup). */
export function PanelLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`font-display uppercase text-muted-foreground ${className}`}
      style={{ fontSize: "clamp(0.62rem,1.25vh,0.82rem)", fontWeight: 600, letterSpacing: "0.18em" }}
    >
      {children}
    </span>
  );
}

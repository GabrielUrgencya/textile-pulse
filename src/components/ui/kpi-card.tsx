"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { cardEnter, cardEnterTransition } from "@/lib/motion";

/**
 * Story 8.39 — KpiCard glass (Dashboards 2.0).
 * Glassmorphism via white-alpha sobre o dark base (sem cor nova). Variante highlight
 * com glow no topo. Hover só transform/box-shadow/border-color. Anatomia tipográfica
 * via subcomponentes (Label/Value/Delta/Support).
 */

interface KpiCardProps extends React.HTMLAttributes<HTMLDivElement> {
  highlight?: boolean;
  interactive?: boolean;
  /** índice para stagger de entrada (opcional). */
  index?: number;
  animate?: boolean;
}

export function KpiCard({
  className,
  highlight = false,
  interactive = false,
  index = 0,
  animate = true,
  children,
  ...props
}: KpiCardProps) {
  const reduce = useReducedMotion();
  const shouldAnimate = animate && !reduce;

  return (
    <motion.div
      // glass: bg white-alpha + blur + borda sutil; raio 2xl (16px). Sem cor nova.
      className={cn(
        // SEM overflow-hidden: jamais clipar número display (D1). Decoração se auto-clipa.
        // Superfície DEFINIDA (card elevado + borda visível) p/ separar bem do fundo e
        // entre si — como dashboards profissionais (referência do cliente).
        "relative rounded-[20px] border p-6 md:p-7",
        "bg-card",
        "border-border",
        "shadow-[0_20px_40px_-24px_rgba(0,0,0,0.6)]",
        interactive &&
          "transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(0,0,0,0.24)] hover:border-foreground/20",
        className,
      )}
      variants={shouldAnimate ? cardEnter : undefined}
      initial={shouldAnimate ? "hidden" : undefined}
      animate={shouldAnimate ? "visible" : undefined}
      transition={shouldAnimate ? { ...cardEnterTransition, delay: index * 0.05 } : undefined}
      {...(props as React.ComponentProps<typeof motion.div>)}
    >
      {highlight && (
        // Glow sutil no topo — gradiente via foreground (sem cor nova)
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-[10%] top-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent, color-mix(in oklch, var(--foreground) 60%, transparent), transparent)" }}
        />
      )}
      {children}
    </motion.div>
  );
}

/* ── Anatomia tipográfica ── */

export function KpiLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  // Rótulo discreto: pequeno, semibold, tracking largo, silenciado (não compete com o dado).
  return (
    <div className={cn("text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-semibold", className)}>
      {children}
    </div>
  );
}

export function KpiValue({ children, className }: { children: React.ReactNode; className?: string }) {
  // A estrela: 48–56px bold (clamp responsivo; em TV ocupa o máximo).
  // leading-[1.1] + pb sutil garantem que a BASE dos glifos (0/8/9) nunca seja
  // decepada pelo overflow-hidden do card ancestral.
  return (
    <div
      className={cn("block font-display font-bold text-foreground text-[clamp(2.5rem,4vw,3.5rem)]", className)}
      style={{ lineHeight: 1, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", paddingBottom: "0.08em" }}
    >
      {children}
    </div>
  );
}

export function KpiDelta({ value, suffix = "", className }: { value: number; suffix?: string; className?: string }) {
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[13px] font-medium", up ? "text-success" : "text-destructive", className)}>
      <Icon className="size-3.5" />
      {Math.abs(value).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}{suffix}
    </span>
  );
}

export function KpiSupport({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("text-[13px] text-muted-foreground", className)}>{children}</div>;
}

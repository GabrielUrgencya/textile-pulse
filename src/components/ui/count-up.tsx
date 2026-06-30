"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "motion/react";

/**
 * Story 8.39 — CountUp (Dashboards 2.0).
 * Anima a transição de um número (sobe/desce suave), nunca pisca.
 * Respeita prefers-reduced-motion (mostra o valor final direto).
 */
export function CountUp({
  value,
  decimals = 0,
  duration = 0.8,
  className,
}: {
  value: number;
  decimals?: number;
  duration?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);

  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      prev.current = value;
      return;
    }
    const controls = animate(prev.current, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(v),
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, duration, reduce]);

  return (
    <span className={className}>
      {display.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
    </span>
  );
}

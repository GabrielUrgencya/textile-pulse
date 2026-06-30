import type { Variants, Transition } from "motion/react";

/**
 * Story 8.39 — helpers de motion das Dashboards 2.0.
 * Animações usam apenas transform/opacity (60fps). Respeite prefers-reduced-motion
 * nos componentes que consomem (ver useReducedMotion do motion).
 */

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Entrada de card: fade + translateY + leve scale. */
export const cardEnter: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1 },
};

export const cardEnterTransition: Transition = { duration: 0.4, ease: EASE_OUT };

/** Container com stagger de 50ms entre filhos. */
export const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

/** Delay calculado por índice (para listas sem container variants). */
export function staggerDelay(index: number, step = 0.05): number {
  return index * step;
}

"use client";

import { useEffect, useId, useState } from "react";
import { useReducedMotion } from "motion/react";
import { CountUp } from "@/components/ui/count-up";
import { STATE_COLORS, nf, type PaceState } from "./state";

/**
 * Medidor radial HERÓI (SVG) — "quanto produzimos vs meta do momento".
 * Anel que enche (stroke-dashoffset), gradiente cromático por estado, glow,
 * anel de traços (instrumento) e ponto luminoso na ponta do progresso.
 * Número gigante no centro (Inter/tabular-nums) + % colorido pelo estado.
 */

const SIZE = 320;
const CENTER = SIZE / 2;
const R = 132; // raio do anel de progresso
const TICK_R = 154; // raio do anel de traços
const STROKE = 20;
const C = 2 * Math.PI * R; // circunferência

interface Props {
  produced: number;
  target: number | null;
  percent: number;
  unit: string | null;
  state: PaceState;
}

export function RadialGauge({ produced, target, percent, unit, state }: Props) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/:/g, "");
  const color = STATE_COLORS[state];

  // Fração 0..1 do anel (o número pode passar de 100%, o anel satura em 100%).
  const frac = Math.max(0, Math.min(1, percent / 100));

  // Preenche a partir do vazio no mount (draw-in). Reduced-motion → direto.
  const [drawn, setDrawn] = useState(reduce ? frac : 0);
  useEffect(() => {
    if (reduce) { setDrawn(frac); return; }
    const t = requestAnimationFrame(() => setDrawn(frac));
    return () => cancelAnimationFrame(t);
  }, [frac, reduce]);

  const offset = C * (1 - drawn);

  // Ponta luminosa: começa às 12h (-90°), gira no sentido horário.
  const tipAngle = -90 + drawn * 360;
  const tipX = CENTER + R * Math.cos((tipAngle * Math.PI) / 180);
  const tipY = CENTER + R * Math.sin((tipAngle * Math.PI) / 180);

  const pctText = Math.round(percent);

  return (
    <div className="relative grid place-items-center">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-[min(42vh,460px)]" role="img" aria-label={`Meta do momento: ${pctText}%`}>
        <defs>
          <linearGradient id={`arc-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color.light} />
            <stop offset="100%" stopColor={color.main} />
          </linearGradient>
          <filter id={`glow-${uid}`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Anel de traços (instrumento) */}
        <circle
          cx={CENTER} cy={CENTER} r={TICK_R} fill="none"
          stroke="rgba(255,255,255,0.16)" strokeWidth={2}
          strokeDasharray="2 13" strokeLinecap="round"
        />

        {/* Track */}
        <circle cx={CENTER} cy={CENTER} r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={STROKE} />

        {/* Progresso (gira -90° p/ começar às 12h) */}
        <g transform={`rotate(-90 ${CENTER} ${CENTER})`}>
          <circle
            cx={CENTER} cy={CENTER} r={R} fill="none"
            stroke={`url(#arc-${uid})`} strokeWidth={STROKE} strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={offset}
            filter={`url(#glow-${uid})`}
            style={{
              transition: reduce ? undefined : "stroke-dashoffset 1.7s cubic-bezier(0.22,1,0.36,1), stroke 0.6s ease",
            }}
          />
        </g>

        {/* Ponta luminosa na frente do progresso */}
        {drawn > 0.001 && (
          <circle
            cx={tipX} cy={tipY} r={STROKE / 2 + 1} fill={color.light}
            filter={`url(#glow-${uid})`}
            style={{ transition: reduce ? undefined : "all 1.7s cubic-bezier(0.22,1,0.36,1)" }}
          />
        )}
      </svg>

      {/* Centro — número gigante + % + meta */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
        <span
          className="font-display tabular-nums leading-none text-foreground"
          style={{ fontSize: "clamp(3.2rem,9vh,6rem)", fontWeight: 800, textShadow: `0 0 28px ${color.glow}` }}
        >
          <CountUp value={produced} />
        </span>
        <span
          className="font-display tabular-nums leading-none"
          style={{ fontSize: "clamp(1.3rem,3.4vh,2.2rem)", fontWeight: 800, color: color.main }}
        >
          {pctText}%
        </span>
        <span
          className="font-display uppercase tabular-nums text-muted-foreground"
          style={{ fontSize: "clamp(0.7rem,1.5vh,1rem)", fontWeight: 600, letterSpacing: "0.14em" }}
        >
          / {target != null ? nf(target) : "—"}{unit ? ` ${unit}` : ""}
        </span>
      </div>
    </div>
  );
}

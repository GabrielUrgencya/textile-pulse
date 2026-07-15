"use client";

import { useEffect, useId, useState } from "react";
import { useReducedMotion } from "motion/react";
import { STATE_COLORS, paceFromPercent } from "./state";

/**
 * Mini-anel de período (semana/mês) — mesma técnica do herói, em escala.
 * A cor segue o próprio percentual do período (verde/âmbar/vermelho).
 */

const SIZE = 120;
const CENTER = SIZE / 2;
const R = 46;
const STROKE = 9;
const C = 2 * Math.PI * R;

interface Props {
  label: string;
  percent: number; // 0..100+ (satura o anel em 100)
  estimated?: boolean;
}

export function MiniRing({ label, percent, estimated }: Props) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/:/g, "");
  const color = STATE_COLORS[paceFromPercent(percent)];
  const frac = Math.max(0, Math.min(1, percent / 100));

  const [drawn, setDrawn] = useState(reduce ? frac : 0);
  useEffect(() => {
    if (reduce) { setDrawn(frac); return; }
    const t = requestAnimationFrame(() => setDrawn(frac));
    return () => cancelAnimationFrame(t);
  }, [frac, reduce]);

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative grid place-items-center">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-[clamp(72px,9vh,104px)]" role="img" aria-label={`${label}: ${Math.round(percent)}%`}>
          <defs>
            <linearGradient id={`mini-${uid}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={color.light} />
              <stop offset="100%" stopColor={color.main} />
            </linearGradient>
          </defs>
          <circle cx={CENTER} cy={CENTER} r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={STROKE} />
          <g transform={`rotate(-90 ${CENTER} ${CENTER})`}>
            <circle
              cx={CENTER} cy={CENTER} r={R} fill="none"
              stroke={`url(#mini-${uid})`} strokeWidth={STROKE} strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - drawn)}
              style={{ transition: reduce ? undefined : "stroke-dashoffset 1.5s cubic-bezier(0.22,1,0.36,1)" }}
            />
          </g>
        </svg>
        <span
          className="absolute font-display tabular-nums leading-none"
          style={{ fontSize: "clamp(0.85rem,2vh,1.3rem)", fontWeight: 800, color: color.main }}
        >
          {Math.round(percent)}%
        </span>
      </div>
      <span
        className="font-display uppercase text-muted-foreground"
        style={{ fontSize: "clamp(0.6rem,1.3vh,0.8rem)", fontWeight: 600, letterSpacing: "0.16em" }}
      >
        {label}{estimated ? " ·" : ""}
      </span>
    </div>
  );
}

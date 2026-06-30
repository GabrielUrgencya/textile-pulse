"use client";

import { useEffect, useRef } from "react";
import { motion, useMotionValue, useTransform, animate } from "motion/react";
import { LisionCard } from "@/components/ui/lision-card";
import { TrendingUp, Zap, Target } from "lucide-react";

const EASE = [0.22, 1, 0.36, 1] as const;

interface TVHeroProps {
  producedToday: number;
  dailyTarget: number;
  percent: number;
  currentRate: number;
  peakRate: number;
  projectedEnd: number;
  activeShift?: string | null;
}

/* ─── Animated counter ─── */
function AnimNum({ value, format = "int" }: { value: number; format?: "int" | "pct" }) {
  const ref = useRef<HTMLSpanElement>(null);
  const mv = useMotionValue(0);

  useEffect(() => {
    const c = animate(mv, value, { duration: 1.2, ease: [0.22, 1, 0.36, 1] });
    return () => c.stop();
  }, [value, mv]);

  const disp = useTransform(mv, (v) => {
    if (format === "pct") return `${Math.round(v)}%`;
    return Math.round(v).toLocaleString("pt-BR");
  });

  useEffect(() => {
    const unsub = disp.on("change", (v) => {
      if (ref.current) ref.current.textContent = v;
    });
    return unsub;
  }, [disp]);

  const initial = format === "pct" ? `${value}%` : value.toLocaleString("pt-BR");
  return <span ref={ref}>{initial}</span>;
}

/* ─── Arc gauge constants ─── */
const SIZE = 200;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = 82;
const SW = 12;
const C = 2 * Math.PI * R;
const ARC_DEG = 270;
const ARC_LEN = (ARC_DEG / 360) * C;
const ROT = 135;

function arcColor(pct: number) {
  if (pct >= 80) return "var(--success)";
  if (pct >= 50) return "var(--warning)";
  return "var(--destructive)";
}

export function TVHero({
  producedToday,
  dailyTarget,
  percent,
  currentRate,
  peakRate,
  projectedEnd,
  activeShift,
}: TVHeroProps) {
  const clamped = Math.min(percent, 100);
  const offset = ARC_LEN * (1 - clamped / 100);
  const color = arcColor(percent);

  return (
    <motion.div
      className="h-full"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, ease: EASE }}
    >
      <LisionCard className="h-full flex flex-col items-center justify-center p-4 relative">
        {/* Glow behind gauge — camada própria que se auto-clipa (não clipa o card) */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[60px] opacity-15"
            style={{ width: 160, height: 160, background: color }}
          />
        </div>

        <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground/60 font-medium mb-2 z-10">
          {activeShift ? `Produção (${activeShift})` : "Produção Hoje"}
        </div>

        {/* SVG Arc Gauge */}
        <div className="relative z-10" style={{ width: SIZE, height: SIZE }}>
          <svg
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            style={{ transform: `rotate(${ROT}deg)` }}
          >
            {/* Tick marks */}
            {Array.from({ length: 27 }).map((_, i) => {
              const angle = (i / 26) * ARC_DEG * (Math.PI / 180);
              const inner = R - SW / 2 - 4;
              const outer = R - SW / 2 - 1;
              const x1 = CX + inner * Math.cos(angle);
              const y1 = CY + inner * Math.sin(angle);
              const x2 = CX + outer * Math.cos(angle);
              const y2 = CY + outer * Math.sin(angle);
              return (
                <line
                  key={i}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="oklch(0.25 0 0)"
                  strokeWidth={i % 9 === 0 ? 1.5 : 0.5}
                />
              );
            })}
            {/* Background arc */}
            <circle
              cx={CX}
              cy={CY}
              r={R}
              fill="none"
              stroke="oklch(0.14 0 0)"
              strokeWidth={SW}
              strokeDasharray={`${ARC_LEN} ${C}`}
              strokeLinecap="round"
            />
            {/* Progress arc */}
            <motion.circle
              cx={CX}
              cy={CY}
              r={R}
              fill="none"
              stroke={color}
              strokeWidth={SW}
              strokeDasharray={`${ARC_LEN} ${C}`}
              strokeLinecap="round"
              initial={{ strokeDashoffset: ARC_LEN }}
              animate={{ strokeDashoffset: offset }}
              transition={{ duration: 1.5, ease: EASE }}
              style={{ filter: `drop-shadow(0 0 6px ${color})` }}
            />
          </svg>

          {/* Center text */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ paddingTop: 6 }}
          >
            <span className="font-display text-[42px] font-semibold tabular-nums leading-none">
              <AnimNum value={producedToday} />
            </span>
            <span className="text-[11px] text-muted-foreground/50 mt-0.5">
              / {dailyTarget.toLocaleString("pt-BR")}
            </span>
            <span
              className="font-mono text-[18px] tabular-nums font-medium mt-1"
              style={{ color }}
            >
              <AnimNum value={percent} format="pct" />
            </span>
          </div>
        </div>

        {/* Sub-metrics */}
        <div className="flex items-center gap-4 mt-2 z-10">
          <MiniStat
            icon={<Target className="size-3 text-muted-foreground/40" />}
            label="Projeção"
            value={`~${projectedEnd.toLocaleString("pt-BR")}`}
          />
          <div className="w-px h-5 bg-border/30" />
          <MiniStat
            icon={<Zap className="size-3 text-muted-foreground/40" />}
            label="Ritmo"
            value={`${currentRate}/h`}
          />
          <div className="w-px h-5 bg-border/30" />
          <MiniStat
            icon={<TrendingUp className="size-3 text-muted-foreground/40" />}
            label="Pico"
            value={`${peakRate}/h`}
          />
        </div>
      </LisionCard>
    </motion.div>
  );
}

function MiniStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {icon}
      <div>
        <div className="text-[8px] uppercase tracking-wider text-muted-foreground/50">
          {label}
        </div>
        <div className="font-mono text-[13px] tabular-nums font-medium leading-tight">
          {value}
        </div>
      </div>
    </div>
  );
}

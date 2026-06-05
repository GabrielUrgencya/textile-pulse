"use client";

import { useEffect, useRef } from "react";
import { motion, useMotionValue, useTransform, animate } from "motion/react";
import { LisionCard } from "@/components/ui/lision-card";
import { ArrowUp, ArrowDown } from "lucide-react";

const EASE = [0.22, 1, 0.36, 1] as const;

/* ─── Animated value ─── */
function AnimVal({ value, suffix = "" }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const mv = useMotionValue(0);

  useEffect(() => {
    const c = animate(mv, value, { duration: 1.0, ease: [0.22, 1, 0.36, 1] });
    return () => c.stop();
  }, [value, mv]);

  const disp = useTransform(mv, (v) => {
    if (suffix === "%") return `${v.toFixed(1)}${suffix}`;
    return Math.round(v).toLocaleString("pt-BR");
  });

  useEffect(() => {
    const unsub = disp.on("change", (v) => {
      if (ref.current) ref.current.textContent = v;
    });
    return unsub;
  }, [disp]);

  const initial = suffix === "%" ? `${value.toFixed(1)}${suffix}` : value.toLocaleString("pt-BR");
  return <span ref={ref}>{initial}</span>;
}

/* ─── Mini ring gauge ─── */
const RING_SIZE = 36;
const RING_R = 14;
const RING_C = 2 * Math.PI * RING_R;

function MiniRing({ percent, color }: { percent: number; color: string }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = RING_C * (1 - clamped / 100);

  return (
    <svg
      width={RING_SIZE}
      height={RING_SIZE}
      viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
      className="shrink-0"
    >
      <circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_R}
        fill="none"
        stroke="oklch(0.14 0 0)"
        strokeWidth={2.5}
      />
      <motion.circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_R}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray={RING_C}
        initial={{ strokeDashoffset: RING_C }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1.2, ease: EASE }}
        style={{ transform: "rotate(-90deg)", transformOrigin: "center" }}
      />
    </svg>
  );
}

/* ─── Props ─── */
interface TVKpisProps {
  activeOps: number;
  opsTarget: number;
  activeLots: number;
  lotsTarget: number;
  defectRate: number;
  defectTolerance: number;
  scansToday: number;
  scansYesterday: number;
  currentRate: number;
  peakRate: number;
  projectedEnd: number;
  dailyTarget: number;
}

export function TVKpis({
  activeOps,
  opsTarget,
  activeLots,
  lotsTarget,
  defectRate,
  defectTolerance,
  scansToday,
  scansYesterday,
  currentRate,
  peakRate,
  projectedEnd,
  dailyTarget,
}: TVKpisProps) {
  const scansDiff =
    scansYesterday > 0
      ? Math.round(((scansToday - scansYesterday) / scansYesterday) * 100)
      : 0;
  const scansUp = scansDiff >= 0;

  const efficiency = peakRate > 0 ? Math.min((currentRate / peakRate) * 100, 100) : 0;
  const projPercent = dailyTarget > 0 ? Math.min((projectedEnd / dailyTarget) * 100, 100) : 0;

  const kpis: KpiDef[] = [
    {
      label: "OPs Ativas",
      value: activeOps,
      suffix: "",
      sub: `meta: ${opsTarget}`,
      ring: opsTarget > 0 ? Math.min((activeOps / opsTarget) * 100, 100) : 0,
      ringColor: activeOps >= opsTarget ? "oklch(0.75 0.16 145)" : "oklch(0.55 0 0)",
      trend: undefined,
      warning: false,
    },
    {
      label: "Lotes Ativos",
      value: activeLots,
      suffix: "",
      sub: `meta: ${lotsTarget}`,
      ring: lotsTarget > 0 ? Math.min((activeLots / lotsTarget) * 100, 100) : 0,
      ringColor: activeLots >= lotsTarget ? "oklch(0.75 0.16 145)" : "oklch(0.55 0 0)",
      trend: undefined,
      warning: false,
    },
    {
      label: "Taxa Defeitos",
      value: defectRate,
      suffix: "%",
      sub: `tol: ${defectTolerance}%`,
      ring:
        defectTolerance > 0
          ? Math.min((defectRate / defectTolerance) * 100, 100)
          : 0,
      ringColor:
        defectRate <= defectTolerance
          ? "oklch(0.75 0.16 145)"
          : "oklch(0.65 0.20 25)",
      trend: undefined,
      warning: defectRate > defectTolerance,
    },
    {
      label: "Bipagens Hoje",
      value: scansToday,
      suffix: "",
      sub: scansDiff !== 0 ? `${scansUp ? "+" : ""}${scansDiff}%` : "—",
      ring: 0,
      ringColor: "",
      trend: scansDiff !== 0 ? scansUp : undefined,
      warning: false,
    },
    {
      label: "Eficiência",
      value: Math.round(efficiency),
      suffix: "%",
      sub: `pico: ${peakRate}/h`,
      ring: efficiency,
      ringColor:
        efficiency >= 80
          ? "oklch(0.75 0.16 145)"
          : efficiency >= 50
            ? "oklch(0.80 0.15 75)"
            : "oklch(0.65 0.20 25)",
      trend: undefined,
      warning: efficiency < 50,
    },
    {
      label: "Projeção",
      value: projectedEnd,
      suffix: "",
      sub: `meta: ${dailyTarget.toLocaleString("pt-BR")}`,
      ring: projPercent,
      ringColor:
        projPercent >= 80
          ? "oklch(0.75 0.16 145)"
          : projPercent >= 50
            ? "oklch(0.80 0.15 75)"
            : "oklch(0.65 0.20 25)",
      trend: undefined,
      warning: projPercent < 50,
    },
  ];

  return (
    <div className="grid grid-cols-3 grid-rows-2 gap-2 h-full">
      {kpis.map((kpi, i) => (
        <motion.div
          key={kpi.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 + i * 0.06, ease: EASE }}
        >
          <LisionCard
            className={`h-full ${kpi.warning ? "border-destructive/40" : ""}`}
            pad={false}
          >
            <div className="p-3 h-full flex flex-col justify-center">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground/60 font-medium mb-1">
                    {kpi.label}
                  </div>
                  <div className="font-display text-[28px] font-semibold tabular-nums leading-none">
                    <AnimVal value={kpi.value} suffix={kpi.suffix} />
                  </div>
                  <div className="flex items-center gap-1 mt-1.5">
                    {kpi.trend !== undefined &&
                      (kpi.trend ? (
                        <ArrowUp className="size-3 text-success" />
                      ) : (
                        <ArrowDown className="size-3 text-destructive" />
                      ))}
                    <span className="text-[10px] text-muted-foreground/50">
                      {kpi.sub}
                    </span>
                  </div>
                </div>
                {kpi.ring > 0 && (
                  <MiniRing percent={kpi.ring} color={kpi.ringColor} />
                )}
              </div>
            </div>
          </LisionCard>
        </motion.div>
      ))}
    </div>
  );
}

interface KpiDef {
  label: string;
  value: number;
  suffix: string;
  sub: string;
  ring: number;
  ringColor: string;
  trend: boolean | undefined;
  warning: boolean;
}

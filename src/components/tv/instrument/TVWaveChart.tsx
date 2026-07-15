"use client";

import { useId } from "react";
import type { HourlyPoint } from "@/lib/sector-kpis";
import { STATE_COLORS, type PaceState } from "./state";

/**
 * Onda de produção por hora (SVG) — curva suave (Catmull-Rom→bezier), área com
 * gradiente que desvanece, linha luminosa (drop-shadow), linha de meta tracejada
 * e ponto "agora" pulsante. Cor acompanha o estado do setor.
 *
 * viewBox 0..100 × 0..100 com preserveAspectRatio="none": a onda ocupa o card
 * inteiro; o traço não distorce (vector-effect) e dot/meta/labels são overlays
 * HTML posicionados em % — nítidos em qualquer tamanho de TV.
 */

interface Props {
  data: HourlyPoint[];
  metaPorHora?: number;
  state: PaceState;
}

// Área de plotagem em % (deixa respiro no topo e base p/ rótulos de hora).
const TOP = 6;
const BOT = 88;

function yOf(v: number, max: number): number {
  const t = max > 0 ? v / max : 0;
  return BOT - t * (BOT - TOP);
}

/** Path suave (Catmull-Rom → cubic bezier) por uma lista de pontos {x,y}. */
function smoothPath(pts: Array<{ x: number; y: number }>): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export function TVWaveChart({ data, metaPorHora, state }: Props) {
  const uid = useId().replace(/:/g, "");
  const color = STATE_COLORS[state];
  const n = data.length;

  const values = data.map((d) => d.value ?? 0);
  const max = Math.max(1, ...values, metaPorHora ?? 0) * 1.15;
  const hasData = values.some((v) => v > 0);

  const pts = data.map((d, i) => ({
    x: n > 1 ? (i / (n - 1)) * 100 : 50,
    y: yOf(d.value ?? 0, max),
  }));

  const line = smoothPath(pts);
  const area = hasData ? `${line} L ${pts[n - 1].x} ${BOT} L ${pts[0].x} ${BOT} Z` : "";

  // Último ponto com produção > 0 → posição do "agora".
  let nowIdx = -1;
  for (let i = 0; i < values.length; i++) if (values[i] > 0) nowIdx = i;
  const now = nowIdx >= 0 ? pts[nowIdx] : null;

  const metaTop = metaPorHora ? yOf(metaPorHora, max) : null;

  if (!hasData) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 text-center">
        <div className="size-2 rounded-full bg-muted-foreground/50" />
        <p className="font-display text-[14px] font-medium text-muted-foreground">Sem produção registrada</p>
        <p className="text-[12px] text-muted-foreground/60">A onda aparece com as bipagens do dia.</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-0 flex-1">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <linearGradient id={`wfill-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color.main} stopOpacity={0.42} />
            <stop offset="100%" stopColor={color.main} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#wfill-${uid})`} />
        <path
          d={line}
          fill="none"
          stroke={color.light}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          style={{ filter: `drop-shadow(0 0 6px ${color.glow})` }}
        />
      </svg>

      {/* Linha de meta (overlay HTML — nítida) */}
      {metaTop != null && (
        <div className="pointer-events-none absolute inset-x-0" style={{ top: `${metaTop}%` }}>
          <div className="border-t border-dashed border-white/25" />
          <span
            className="absolute right-0 -top-4 font-display font-semibold uppercase text-white/40"
            style={{ fontSize: "clamp(0.55rem,1.1vh,0.72rem)", letterSpacing: "0.1em" }}
          >
            Meta {metaPorHora}/h
          </span>
        </div>
      )}

      {/* Ponto "agora" pulsante */}
      {now && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${now.x}%`, top: `${now.y}%` }}
        >
          <span className="absolute inset-0 -m-1 rounded-full tv-live-ping" style={{ background: color.soft }} />
          <span className="block size-2.5 rounded-full" style={{ background: color.light, boxShadow: `0 0 10px ${color.glow}` }} />
        </div>
      )}

      {/* Rótulos de hora */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between">
        {data.map((d, i) => (
          <span
            key={d.label + i}
            className="font-display tabular-nums text-muted-foreground/70"
            style={{ fontSize: "clamp(0.6rem,1.2vh,0.78rem)" }}
          >
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

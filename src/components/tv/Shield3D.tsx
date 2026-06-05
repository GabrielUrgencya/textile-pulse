"use client";

import { motion } from "motion/react";

const EASE = [0.22, 1, 0.36, 1] as const;

interface Shield3DProps {
  initials: string;
  color: string;
  size?: number;
  className?: string;
}

/**
 * Metallic shield badge using CSS gradients + SVG + Motion animation.
 * No Three.js dependency — works with any Next.js/React version.
 */
export function Shield3D({ initials, color, size = 1, className = "" }: Shield3DProps) {
  const w = Math.round(120 * size);
  const h = Math.round(140 * size);
  const fontSize = Math.round(28 * size);
  const borderW = Math.max(2, Math.round(3 * size));

  return (
    <motion.div
      className={`relative flex items-center justify-center ${className}`}
      style={{ width: w, height: h }}
      animate={{
        y: [0, -4, 0],
        rotateY: [0, 6, 0, -6, 0],
      }}
      transition={{
        duration: 4,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    >
      {/* Shield SVG shape */}
      <svg
        viewBox="0 0 120 140"
        width={w}
        height={h}
        className="absolute inset-0"
        style={{ filter: `drop-shadow(0 4px 12px ${color}44)` }}
      >
        <defs>
          {/* Metallic gradient */}
          <linearGradient id={`shield-grad-${initials}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={lighten(color, 40)} />
            <stop offset="30%" stopColor={color} />
            <stop offset="50%" stopColor={lighten(color, 20)} />
            <stop offset="70%" stopColor={color} />
            <stop offset="100%" stopColor={darken(color, 30)} />
          </linearGradient>

          {/* Inner bevel gradient */}
          <linearGradient id={`shield-inner-${initials}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.25)" />
            <stop offset="50%" stopColor="rgba(255,255,255,0.05)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.2)" />
          </linearGradient>

          {/* Shimmer highlight */}
          <linearGradient id={`shield-shimmer-${initials}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0)" />
            <stop offset="45%" stopColor="rgba(255,255,255,0)" />
            <stop offset="50%" stopColor="rgba(255,255,255,0.3)" />
            <stop offset="55%" stopColor="rgba(255,255,255,0)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>

        {/* Outer shield — classic heraldic shape */}
        <path
          d="M60 4 L110 20 L110 75 Q110 120 60 136 Q10 120 10 75 L10 20 Z"
          fill={`url(#shield-grad-${initials})`}
          stroke={lighten(color, 30)}
          strokeWidth={borderW}
        />

        {/* Inner shield bevel */}
        <path
          d="M60 14 L100 27 L100 73 Q100 112 60 126 Q20 112 20 73 L20 27 Z"
          fill={`url(#shield-inner-${initials})`}
        />

        {/* Top rim highlight */}
        <path
          d="M60 14 L100 27 L100 40 Q60 32 20 40 L20 27 Z"
          fill="rgba(255,255,255,0.15)"
        />
      </svg>

      {/* Animated shimmer overlay */}
      <motion.div
        className="absolute inset-0 overflow-hidden rounded-lg"
        style={{ width: w, height: h }}
      >
        <motion.div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.12) 50%, transparent 60%)",
            width: "200%",
            height: "100%",
          }}
          animate={{ x: ["-100%", "100%"] }}
          transition={{
            duration: 3,
            repeat: Infinity,
            repeatDelay: 2,
            ease: EASE,
          }}
        />
      </motion.div>

      {/* Initials text */}
      <span
        className="relative z-10 font-display font-bold text-white"
        style={{
          fontSize,
          textShadow: "0 2px 4px rgba(0,0,0,0.5), 0 0 8px rgba(255,255,255,0.15)",
          letterSpacing: "0.05em",
        }}
      >
        {initials}
      </span>
    </motion.div>
  );
}

// Color utilities — hex manipulation
function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace("#", "");
  return [
    parseInt(c.substring(0, 2), 16),
    parseInt(c.substring(2, 4), 16),
    parseInt(c.substring(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${clamp(r).toString(16).padStart(2, "0")}${clamp(g).toString(16).padStart(2, "0")}${clamp(b).toString(16).padStart(2, "0")}`;
}

function lighten(hex: string, percent: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = percent / 100;
  return rgbToHex(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f);
}

function darken(hex: string, percent: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = 1 - percent / 100;
  return rgbToHex(r * f, g * f, b * f);
}

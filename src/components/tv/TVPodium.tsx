"use client";

import { motion } from "motion/react";
import { Crown } from "lucide-react";

const EASE = [0.22, 1, 0.36, 1] as const;

interface FactionEntry {
  id: string;
  name: string;
  initials: string;
  avatar_url: string | null;
  score: number;
  punctuality: number;
  quality: number;
  volume: number;
  deliveries_count: number;
}

interface TVPodiumProps {
  ranking: FactionEntry[];
}

/* ─── Shield colors per position: gold, silver, bronze ─── */
export const SHIELD_THEMES = [
  {
    // 1st — Gold
    gradient: "linear-gradient(160deg, #D4A843 0%, #F5D978 25%, #C9A94E 50%, #A8882A 75%, #D4A843 100%)",
    border: "#F5D978",
    glow: "rgba(212, 168, 67, 0.4)",
    accent: "#F5D978",
  },
  {
    // 2nd — Silver
    gradient: "linear-gradient(160deg, #8A8A8A 0%, #C8C8C8 25%, #A0A0A0 50%, #787878 75%, #A0A0A0 100%)",
    border: "#C8C8C8",
    glow: "rgba(160, 160, 160, 0.3)",
    accent: "#C8C8C8",
  },
  {
    // 3rd — Bronze
    gradient: "linear-gradient(160deg, #8B5E3C 0%, #C4916C 25%, #A07050 50%, #6B4424 75%, #8B5E3C 100%)",
    border: "#C4916C",
    glow: "rgba(164, 112, 80, 0.3)",
    accent: "#C4916C",
  },
];

/* ─── Display config: [2nd, 1st, 3rd] ─── */
export const POSITIONS = [
  { themeIdx: 1, shieldSize: 130, photoSize: 80, platformH: 120, delay: 1.8, label: "2" },
  { themeIdx: 0, shieldSize: 170, photoSize: 110, platformH: 160, delay: 2.3, label: "crown" },
  { themeIdx: 2, shieldSize: 120, photoSize: 72, platformH: 100, delay: 2.0, label: "3" },
];

const EMPTY_FACTION: FactionEntry = {
  id: "empty",
  name: "—",
  initials: "?",
  avatar_url: null,
  score: 0,
  punctuality: 0,
  quality: 0,
  volume: 0,
  deliveries_count: 0,
};

export function TVPodium({ ranking }: TVPodiumProps) {
  const padded: FactionEntry[] = [
    ranking[0] ?? EMPTY_FACTION,
    ranking[1] ?? { ...EMPTY_FACTION, id: "empty-2" },
    ranking[2] ?? { ...EMPTY_FACTION, id: "empty-3" },
  ];

  // Display order: [2nd, 1st, 3rd]
  const displayItems = [
    { faction: padded[1], posIndex: 0 },
    { faction: padded[0], posIndex: 1 },
    { faction: padded[2], posIndex: 2 },
  ];

  return (
    <div className="flex items-end justify-center gap-6">
      {displayItems.map(({ faction, posIndex }) => {
        const pos = POSITIONS[posIndex];
        const theme = SHIELD_THEMES[pos.themeIdx];
        const isFirst = pos.label === "crown";
        const isEmpty = faction.id.startsWith("empty");

        return (
          <motion.div
            key={faction.id}
            className="flex flex-col items-center"
            initial={{ opacity: 0, scale: isFirst ? 0.5 : 0.8, y: 40 }}
            animate={{ opacity: isEmpty ? 0.3 : 1, scale: 1, y: 0 }}
            transition={{
              duration: isFirst ? 0.7 : 0.5,
              delay: pos.delay,
              ease: EASE,
            }}
          >
            {/* Crown or position number */}
            <div className="h-8 flex items-center justify-center mb-1">
              {isFirst ? (
                <Crown className="size-7 text-warning" />
              ) : (
                <span className="text-[14px] font-semibold text-muted-foreground/50">
                  {pos.label}
                </span>
              )}
            </div>

            {/* Ornate Shield with Photo */}
            <ShieldBadge
              avatarUrl={faction.avatar_url}
              initials={faction.initials}
              size={pos.shieldSize}
              photoSize={pos.photoSize}
              theme={theme}
              isFirst={isFirst}
            />

            {/* Name */}
            <span
              className={`text-center max-w-[180px] truncate mt-2 ${
                isFirst
                  ? "font-display text-[20px] font-semibold"
                  : "font-display text-[16px] font-semibold"
              }`}
            >
              {faction.name}
            </span>

            {/* Score */}
            <div className="flex items-baseline mb-3">
              <span
                className={`font-mono tabular-nums font-semibold ${
                  isFirst ? "text-[28px]" : "text-[20px] text-muted-foreground"
                }`}
              >
                {isEmpty ? "—" : faction.score}
              </span>
              {!isEmpty && (
                <span className="text-[11px] text-muted-foreground/50 ml-1">
                  pts
                </span>
              )}
            </div>

            {/* 3D Platform */}
            <Platform3D
              height={pos.platformH}
              accent={theme.accent}
              glow={theme.glow}
              isFirst={isFirst}
            />
          </motion.div>
        );
      })}
    </div>
  );
}

/* ─── Ornate Shield Badge ─── */
interface ShieldBadgeProps {
  avatarUrl: string | null;
  initials: string;
  size: number;
  photoSize: number;
  theme: (typeof SHIELD_THEMES)[number];
  isFirst: boolean;
}

export function ShieldBadge({ avatarUrl, initials, size, photoSize, theme, isFirst }: ShieldBadgeProps) {
  const halfSize = size / 2;

  return (
    <motion.div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size * 1.15 }}
      animate={
        isFirst
          ? { y: [0, -5, 0], rotateY: [0, 4, 0, -4, 0] }
          : { y: [0, -3, 0] }
      }
      transition={{ duration: isFirst ? 4 : 5, repeat: Infinity, ease: "easeInOut" }}
    >
      {/* Shield SVG frame */}
      <svg
        viewBox="0 0 120 140"
        width={size}
        height={size * 1.17}
        className="absolute inset-0"
        style={{ filter: `drop-shadow(0 4px 16px ${theme.glow})` }}
      >
        <defs>
          <linearGradient id={`sg-${initials}-${size}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={theme.border} stopOpacity={0.9} />
            <stop offset="50%" stopColor={theme.accent} stopOpacity={0.6} />
            <stop offset="100%" stopColor={theme.border} stopOpacity={0.9} />
          </linearGradient>
          {/* Clip path for photo area — rounded inner shield */}
          <clipPath id={`clip-${initials}-${size}`}>
            <circle cx="60" cy="62" r="38" />
          </clipPath>
        </defs>

        {/* Outer shield shape */}
        <path
          d="M60 4 L110 20 L110 75 Q110 120 60 136 Q10 120 10 75 L10 20 Z"
          fill="oklch(0.10 0 0)"
          stroke={`url(#sg-${initials}-${size})`}
          strokeWidth={3.5}
        />

        {/* Inner decorative border */}
        <path
          d="M60 12 L102 26 L102 73 Q102 114 60 128 Q18 114 18 73 L18 26 Z"
          fill="none"
          stroke={theme.accent}
          strokeWidth={0.8}
          strokeOpacity={0.3}
        />

        {/* Top ribbon/banner decoration */}
        <path
          d="M30 18 L60 10 L90 18"
          fill="none"
          stroke={theme.accent}
          strokeWidth={1.5}
          strokeOpacity={0.5}
          strokeLinecap="round"
        />

        {/* Bottom chevron decoration */}
        <path
          d="M40 115 L60 125 L80 115"
          fill="none"
          stroke={theme.accent}
          strokeWidth={1}
          strokeOpacity={0.4}
          strokeLinecap="round"
        />

        {/* Corner gems */}
        <circle cx="20" cy="30" r="2.5" fill={theme.accent} opacity={0.5} />
        <circle cx="100" cy="30" r="2.5" fill={theme.accent} opacity={0.5} />
      </svg>

      {/* Photo circle — centered in shield */}
      <div
        className="absolute rounded-full overflow-hidden border-2 flex items-center justify-center"
        style={{
          width: photoSize,
          height: photoSize,
          borderColor: theme.accent,
          top: `${(size * 1.15) / 2 - photoSize / 2 - 4}px`,
          boxShadow: `0 0 20px ${theme.glow}, inset 0 0 10px rgba(0,0,0,0.3)`,
        }}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={initials}
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center font-display font-bold text-white"
            style={{
              fontSize: photoSize * 0.35,
              background: `linear-gradient(135deg, oklch(0.15 0 0), oklch(0.22 0 0))`,
            }}
          >
            {initials}
          </div>
        )}
      </div>

      {/* Shimmer sweep animation */}
      <motion.div
        className="absolute overflow-hidden rounded-lg pointer-events-none"
        style={{
          width: size,
          height: size * 1.15,
          clipPath: `path('M ${halfSize} ${size * 0.03} L ${size * 0.92} ${size * 0.14} L ${size * 0.92} ${size * 0.54} Q ${size * 0.92} ${size * 0.86} ${halfSize} ${size * 0.97} Q ${size * 0.08} ${size * 0.86} ${size * 0.08} ${size * 0.54} L ${size * 0.08} ${size * 0.14} Z')`,
        }}
      >
        <motion.div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.1) 50%, transparent 60%)",
            width: "200%",
            height: "100%",
          }}
          animate={{ x: ["-100%", "100%"] }}
          transition={{ duration: 3, repeat: Infinity, repeatDelay: 2.5, ease: EASE }}
        />
      </motion.div>
    </motion.div>
  );
}

/* ─── 3D Platform ─── */
interface Platform3DProps {
  height: number;
  accent: string;
  glow: string;
  isFirst: boolean;
}

export function Platform3D({ height, accent, glow, isFirst }: Platform3DProps) {
  const width = isFirst ? 160 : 130;

  return (
    <div className="relative" style={{ width, height }}>
      {/* Glow underneath */}
      <div
        className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full blur-xl opacity-40"
        style={{ width: width * 0.8, height: 20, background: glow }}
      />

      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="absolute inset-0"
      >
        <defs>
          {/* Front face gradient */}
          <linearGradient id={`pf-${height}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.18 0 0)" />
            <stop offset="100%" stopColor="oklch(0.08 0 0)" />
          </linearGradient>
          {/* Top face gradient */}
          <linearGradient id={`pt-${height}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.22 0 0)" />
            <stop offset="100%" stopColor="oklch(0.16 0 0)" />
          </linearGradient>
        </defs>

        {/* 3D top face (parallelogram) */}
        <polygon
          points={`10,16 ${width - 10},16 ${width - 20},0 20,0`}
          fill={`url(#pt-${height})`}
          stroke={accent}
          strokeWidth={0.5}
          strokeOpacity={0.3}
        />

        {/* 3D front face */}
        <rect
          x={10}
          y={16}
          width={width - 20}
          height={height - 16}
          rx={4}
          fill={`url(#pf-${height})`}
          stroke={accent}
          strokeWidth={0.5}
          strokeOpacity={0.2}
        />

        {/* Left 3D edge */}
        <polygon
          points={`20,0 10,16 10,${height} 10,${height}`}
          fill="oklch(0.12 0 0)"
          stroke={accent}
          strokeWidth={0.3}
          strokeOpacity={0.15}
        />

        {/* Right 3D edge */}
        <polygon
          points={`${width - 20},0 ${width - 10},16 ${width - 10},${height}`}
          fill="oklch(0.14 0 0)"
          stroke={accent}
          strokeWidth={0.3}
          strokeOpacity={0.15}
        />

        {/* Accent glow line at top */}
        <line
          x1={15}
          y1={17}
          x2={width - 15}
          y2={17}
          stroke={accent}
          strokeWidth={1.5}
          strokeOpacity={0.6}
        />

        {/* Subtle inner reflection lines */}
        <line
          x1={20}
          y1={height * 0.35}
          x2={width - 20}
          y2={height * 0.35}
          stroke={accent}
          strokeWidth={0.3}
          strokeOpacity={0.15}
        />
        <line
          x1={20}
          y1={height * 0.65}
          x2={width - 20}
          y2={height * 0.65}
          stroke={accent}
          strokeWidth={0.3}
          strokeOpacity={0.15}
        />
      </svg>

      {/* Animated glow pulse on top edge for 1st place */}
      {isFirst && (
        <motion.div
          className="absolute top-4 left-3 right-3 h-[2px] rounded-full"
          style={{ background: accent }}
          animate={{ opacity: [0.3, 0.8, 0.3] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
    </div>
  );
}

/* ─── Breakdown bars for 1st place ─── */

interface BreakdownProps {
  punctuality: number;
  quality: number;
  volume: number;
}

export function TVPodiumBreakdown({ punctuality, quality, volume }: BreakdownProps) {
  const bars = [
    { label: "PONTUALIDADE", value: punctuality },
    { label: "QUALIDADE", value: quality },
    { label: "VOLUME", value: volume },
  ];

  return (
    <motion.div
      className="mt-6 rounded-xl border border-border/40 bg-secondary/20 p-4 grid grid-cols-3 gap-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 2.8, ease: EASE }}
    >
      {bars.map((bar) => (
        <div key={bar.label} className="flex flex-col items-center gap-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1">
            {bar.label}
          </span>
          <span className="font-mono text-[18px] tabular-nums font-semibold mb-2">
            {bar.value}%
          </span>
          <div className="w-full h-2 rounded-full bg-secondary/40 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-foreground/70"
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(bar.value, 100)}%` }}
              transition={{ duration: 0.8, delay: 3.0, ease: EASE }}
            />
          </div>
        </div>
      ))}
    </motion.div>
  );
}

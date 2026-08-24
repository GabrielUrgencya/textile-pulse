"use client";

import { motion } from "motion/react";
import { Crown } from "lucide-react";
import { ShieldBadge, Platform3D, SHIELD_THEMES, POSITIONS } from "@/components/tv/TVPodium";

/**
 * Pódium genérico do LISION Vendas — RECICLA o visual do pódium do Lision
 * (TVPodium: escudos ouro/prata/bronze, plataformas 3D, coroa, layout [2º,1º,3º]).
 * Desacoplado de facção: recebe entries { name, initials, scoreText } e serve
 * ao Coletivo (label sanitizado + %) e ao Dashboard (consultora + valor).
 * Delays curtos (in-app), ao contrário dos longos da reveal de TV.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

export type PodiumEntry = { name: string; initials: string; scoreText: string };

export function initials(name?: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const value = parts.map((w) => w[0] ?? "").slice(0, 2).join("").toUpperCase();
  return value || "?";
}

const EMPTY: PodiumEntry = { name: "—", initials: "?", scoreText: "—" };

export function SalesPodium({ entries }: { entries: PodiumEntry[] }) {
  const padded: PodiumEntry[] = [entries[0] ?? EMPTY, entries[1] ?? { ...EMPTY }, entries[2] ?? { ...EMPTY }];
  // Ordem de exibição: [2º, 1º, 3º]
  const displayItems = [
    { entry: padded[1], posIndex: 0, rank: 2, delay: 0.05 },
    { entry: padded[0], posIndex: 1, rank: 1, delay: 0.15 },
    { entry: padded[2], posIndex: 2, rank: 3, delay: 0.1 },
  ];

  return (
    <div className="flex items-end justify-center gap-6">
      {displayItems.map(({ entry, posIndex, rank, delay }) => {
        const pos = POSITIONS[posIndex];
        const theme = SHIELD_THEMES[pos.themeIdx];
        const isFirst = pos.label === "crown";
        const isEmpty = entry.name === "—";

        return (
          <motion.div
            key={`${rank}-${entry.name}`}
            className="flex flex-col items-center"
            aria-label={`${rank}º lugar · ${entry.name} · ${entry.scoreText}`}
            initial={{ opacity: 0, scale: isFirst ? 0.6 : 0.85, y: 24 }}
            animate={{ opacity: isEmpty ? 0.3 : 1, scale: 1, y: 0 }}
            transition={{ duration: isFirst ? 0.6 : 0.45, delay, ease: EASE }}
          >
            {/* Coroa (1º) ou número da posição */}
            <div className="mb-1 flex h-8 items-center justify-center">
              {isFirst ? (
                <Crown className="size-7 text-warning" aria-hidden />
              ) : (
                <span className="text-[14px] font-semibold text-muted-foreground/50">{pos.label}</span>
              )}
            </div>

            <ShieldBadge
              avatarUrl={null}
              initials={entry.initials}
              size={pos.shieldSize}
              photoSize={pos.photoSize}
              theme={theme}
              isFirst={isFirst}
            />

            <span className={`mt-2 max-w-[180px] truncate text-center font-display font-semibold ${isFirst ? "text-[20px]" : "text-[16px]"}`}>
              {entry.name}
            </span>

            <div className="mb-3 flex items-baseline">
              <span className={`font-mono font-semibold tabular-nums ${isFirst ? "text-[22px]" : "text-[17px] text-muted-foreground"}`}>
                {isEmpty ? "—" : entry.scoreText}
              </span>
            </div>

            <Platform3D height={pos.platformH} accent={theme.accent} glow={theme.glow} isFirst={isFirst} />
          </motion.div>
        );
      })}
    </div>
  );
}

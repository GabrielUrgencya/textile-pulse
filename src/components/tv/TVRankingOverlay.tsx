"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { TVPodium, TVPodiumBreakdown } from "./TVPodium";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

type OverlayState = "IDLE" | "ENTERING" | "SHOWING" | "EXITING";

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

interface TVRankingOverlayProps {
  ranking: FactionEntry[];
  cycleInterval?: number;
  showDuration?: number;
}

export function TVRankingOverlay({
  ranking,
  cycleInterval = 120_000,
  showDuration = 15_000,
}: TVRankingOverlayProps) {
  const [state, setState] = useState<OverlayState>("IDLE");
  const [timestamp, setTimestamp] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startCycle = useCallback(() => {
    if (ranking.length < 1) return;

    setTimestamp(
      new Date().toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    );

    setState("ENTERING");

    // ENTERING → SHOWING after 2.5s
    timerRef.current = setTimeout(() => {
      setState("SHOWING");

      // SHOWING → EXITING
      timerRef.current = setTimeout(() => {
        setState("EXITING");

        // EXITING → IDLE after 2s
        timerRef.current = setTimeout(() => {
          setState("IDLE");
        }, 2000);
      }, showDuration - 4500);
    }, 2500);
  }, [ranking.length, showDuration]);

  useEffect(() => {
    if (ranking.length < 1) return;
    const interval = setInterval(startCycle, cycleInterval);
    return () => {
      clearInterval(interval);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [cycleInterval, startCycle, ranking.length]);

  const isVisible = state !== "IDLE";
  const firstPlace = ranking[0];

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed inset-0 z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Curtain — two halves that close then open */}
          <motion.div
            className="absolute inset-0 bg-background z-10"
            initial={{ clipPath: "inset(50% 0 50% 0)" }}
            animate={
              state === "EXITING"
                ? { clipPath: "inset(50% 0 50% 0)" }
                : { clipPath: "inset(0% 0 0% 0)" }
            }
            exit={{ clipPath: "inset(50% 0 50% 0)" }}
            transition={{
              duration: state === "EXITING" ? 0.6 : 0.7,
              ease: EASE,
            }}
          />

          {/* Grid pattern behind */}
          <motion.div
            className="absolute inset-0 bg-grid opacity-20 z-10"
            initial={{ opacity: 0 }}
            animate={state === "EXITING" ? { opacity: 0 } : { opacity: 0.2 }}
            transition={{ duration: 0.5, delay: 0.6 }}
          />

          {/* Radial glow behind logo */}
          <motion.div
            className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
            initial={{ opacity: 0 }}
            animate={state === "EXITING" ? { opacity: 0 } : { opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.5 }}
          >
            <div
              className="w-[600px] h-[400px] rounded-full"
              style={{
                background: "radial-gradient(ellipse, oklch(0.98 0 0 / 0.04) 0%, transparent 70%)",
              }}
            />
          </motion.div>

          {/* Content */}
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center">
            {/* Logo — enters with brightness flash and scale */}
            <motion.div
              className="flex flex-col items-center"
              initial={{ scale: 1.3, opacity: 0, filter: "brightness(3)" }}
              animate={
                state === "EXITING"
                  ? { opacity: 0, scale: 0.9, filter: "brightness(1)" }
                  : state === "SHOWING"
                    ? { scale: 0.6, opacity: 0.4, y: -140, filter: "brightness(1)" }
                    : { scale: 1, opacity: 1, filter: "brightness(1)", y: 0 }
              }
              transition={{
                duration: state === "ENTERING" ? 0.7 : 0.6,
                delay: state === "ENTERING" ? 0.7 : 0,
                ease: EASE,
              }}
            >
              <span className="font-display text-[52px] font-semibold tracking-tight">
                LISION
              </span>
            </motion.div>

            {/* Horizontal line — expands from center */}
            <motion.div
              className="h-[1px] bg-gradient-to-r from-transparent via-foreground/40 to-transparent mt-3"
              initial={{ width: 0, opacity: 0 }}
              animate={
                state === "EXITING"
                  ? { width: 0, opacity: 0 }
                  : { width: 400, opacity: 1 }
              }
              transition={{
                duration: state === "EXITING" ? 0.3 : 0.6,
                delay: state === "ENTERING" ? 0.9 : 0,
                ease: EASE,
              }}
            />

            {/* Title with animated letter-spacing */}
            <motion.h2
              className="text-[14px] uppercase font-medium text-muted-foreground mt-3"
              initial={{ letterSpacing: "0.6em", opacity: 0 }}
              animate={
                state === "EXITING"
                  ? { opacity: 0, letterSpacing: "0.6em" }
                  : { letterSpacing: "0.2em", opacity: 1 }
              }
              transition={{
                duration: state === "ENTERING" ? 0.7 : 0.3,
                delay: state === "ENTERING" ? 1.0 : 0,
                ease: EASE,
              }}
            >
              Ranking de Facções
            </motion.h2>

            <motion.p
              className="text-[11px] text-muted-foreground/50 mt-1 mb-6"
              initial={{ opacity: 0 }}
              animate={state === "EXITING" ? { opacity: 0 } : { opacity: 1 }}
              transition={{
                duration: 0.4,
                delay: state === "ENTERING" ? 1.2 : 0,
              }}
            >
              Período: últimos 30 dias · Atualizado às {timestamp}
            </motion.p>

            {/* Podium — slides up with spring */}
            <motion.div
              initial={{ opacity: 0, y: 60, scale: 0.95 }}
              animate={
                state === "EXITING"
                  ? { opacity: 0, y: -20, scale: 0.9 }
                  : { opacity: 1, y: 0, scale: 1 }
              }
              transition={{
                duration: state === "ENTERING" ? 0.9 : 0.5,
                delay: state === "ENTERING" ? 1.5 : 0,
                ease: EASE,
              }}
            >
              <TVPodium ranking={ranking} />

              {firstPlace && (
                <TVPodiumBreakdown
                  punctuality={firstPlace.punctuality}
                  quality={firstPlace.quality}
                  volume={firstPlace.volume}
                />
              )}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

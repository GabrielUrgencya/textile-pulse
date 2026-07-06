"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { PartyPopper } from "lucide-react";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const SHOW_MS = 6500; // dentro de 5–8s

export interface CelebrationItem {
  id: string;
  scope: "USER" | "SECTOR";
  name: string;
  achieved_at: string;
}

interface TVCelebrationProps {
  achievements: CelebrationItem[];
  /** chave p/ persistir ids já exibidos (evita recelebrar no reload). */
  storageKey: string;
}

function loadShown(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as { date: string; ids: string[] };
    const today = new Date().toISOString().slice(0, 10);
    if (parsed.date !== today) return new Set(); // novo dia → limpa
    return new Set(parsed.ids);
  } catch {
    return new Set();
  }
}
function persistShown(key: string, ids: Set<string>) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(key, JSON.stringify({ date: today, ids: Array.from(ids) }));
  } catch {
    /* ignore */
  }
}

/**
 * Story 8.36 — overlay de celebração ao bater meta, com FILA (sem sobreposição).
 * Reaproveita o padrão visual do ranking (cortina + glow + motion).
 */
export function TVCelebration({ achievements, storageKey }: TVCelebrationProps) {
  const shownRef = useRef<Set<string>>(new Set());
  const initedRef = useRef(false);
  const [queue, setQueue] = useState<CelebrationItem[]>([]);
  const [current, setCurrent] = useState<CelebrationItem | null>(null);

  // Init: carrega ids já exibidos hoje
  if (!initedRef.current && typeof window !== "undefined") {
    shownRef.current = loadShown(storageKey);
    initedRef.current = true;
  }

  // Novas conquistas → enfileira (ignora já exibidas/enfileiradas/atual)
  useEffect(() => {
    if (achievements.length === 0) return;
    setQueue((prev) => {
      const known = new Set([...Array.from(shownRef.current), ...prev.map((q) => q.id), ...(current ? [current.id] : [])]);
      const toAdd = achievements.filter((a) => !known.has(a.id));
      return toAdd.length ? [...prev, ...toAdd] : prev;
    });
  }, [achievements, current]);

  // Desenfileira um por vez (SEM timer aqui — o timer vive num efeito próprio)
  useEffect(() => {
    if (current || queue.length === 0) return;
    const next = queue[0];
    setQueue((q) => q.slice(1));
    setCurrent(next);
    shownRef.current.add(next.id);
    persistShown(storageKey, shownRef.current);
  }, [current, queue, storageKey]);

  // Auto-dismiss após SHOW_MS. BUGFIX: antes o setTimeout era limpo no re-render
  // (quando `current` mudava) e nunca re-armado → a celebração não sumia sozinha.
  // Agora o timer é ancorado só em `current`. Teto de tela ≤ 10s (SHOW_MS).
  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => setCurrent(null), SHOW_MS);
    return () => clearTimeout(t);
  }, [current]);

  const visible = current != null;
  const isUser = current?.scope === "USER";

  return (
    <AnimatePresence>
      {visible && current && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Cortina */}
          <motion.div
            className="absolute inset-0 bg-background/95 z-10"
            initial={{ clipPath: "inset(50% 0 50% 0)" }}
            animate={{ clipPath: "inset(0% 0 0% 0)" }}
            exit={{ clipPath: "inset(50% 0 50% 0)" }}
            transition={{ duration: 0.6, ease: EASE }}
          />
          {/* Glow radial */}
          <motion.div
            className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.4 }}
          >
            <div
              className="w-[700px] h-[460px] rounded-full"
              style={{ background: "radial-gradient(ellipse, oklch(0.85 0.17 145 / 0.10) 0%, transparent 70%)" }}
            />
          </motion.div>

          {/* Conteúdo */}
          <div className="relative z-20 flex flex-col items-center text-center px-8">
            <motion.div
              initial={{ scale: 0.5, opacity: 0, rotate: -15 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ duration: 0.7, delay: 0.5, ease: EASE }}
            >
              <PartyPopper className="size-16 text-success" />
            </motion.div>

            <motion.span
              className="mt-5 text-[14px] uppercase tracking-[0.3em] text-muted-foreground"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.7 }}
            >
              {isUser ? "Meta individual batida" : "Meta do setor batida"}
            </motion.span>

            <motion.h2
              className="mt-2 font-display text-[64px] leading-tight font-semibold"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.85, ease: EASE }}
            >
              🎉 Parabéns, {current.name}!
            </motion.h2>

            <motion.p
              className="mt-2 text-[20px] text-muted-foreground"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 1.1 }}
            >
              {isUser ? "Você bateu sua meta do dia!" : "O setor bateu a meta do dia!"}
            </motion.p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

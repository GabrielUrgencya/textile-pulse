"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Gauge, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { RadialGauge } from "@/components/tv/instrument/RadialGauge";
import type { PaceState } from "@/components/tv/instrument/state";
import {
  salesTvSnapshotSchema,
  type SalesTvSnapshot,
} from "@/lib/sales-tv-access";

/** Banda da meta coletiva → estado cromático do medidor premium do Lision. */
const BAND_STATE: Record<"BUILDING" | "ALERT" | "ACHIEVED", PaceState> = {
  BUILDING: "below",
  ALERT: "warn",
  ACHIEVED: "on",
};

type Bootstrap = { token: string | null; periodKey: string | null };
type ViewState = "loading" | "ready" | "neutral" | "offline";

function readBootstrap(): Bootstrap {
  // SSR-safe: no servidor não há window; o token é lido no cliente (mount).
  if (typeof window === "undefined") return { token: null, periodKey: null };
  const host = window as typeof window & { __salesTvBootstrap?: Bootstrap };
  const value = host.__salesTvBootstrap;
  delete host.__salesTvBootstrap;
  return value ?? { token: null, periodKey: null };
}

function receipt(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function percent(value: number) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

export function SalesTvWorkspace() {
  const [bootstrap] = useState(readBootstrap);
  const [snapshot, setSnapshot] = useState<SalesTvSnapshot | null>(null);
  const [state, setState] = useState<ViewState>("loading");
  const [announcement, setAnnouncement] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [soundUnavailable, setSoundUnavailable] = useState(false);
  const requestId = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const snapshotRef = useRef<SalesTvSnapshot | null>(null);
  const receiptRef = useRef<string | null>(null);
  const refreshMsRef = useRef(30_000);
  const seenReceipts = useRef(new Set<string>());
  const audioContext = useRef<AudioContext | null>(null);
  const soundEnabledRef = useRef(false);

  const playCelebration = useCallback(() => {
    if (!soundEnabledRef.current || !audioContext.current) return;
    try {
      const context = audioContext.current;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      gain.gain.value = 0.04;
      oscillator.frequency.value = 660;
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.18);
    } catch {
      setSoundUnavailable(true);
    }
  }, []);

  const load = useCallback(async () => {
    if (!bootstrap.token) {
      snapshotRef.current = null;
      setSnapshot(null);
      setState("neutral");
      return;
    }
    const currentRequest = ++requestId.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    receiptRef.current ??= receipt();
    const claimReceipt = receiptRef.current;
    const query = new URLSearchParams({ receipt: claimReceipt });
    if (bootstrap.periodKey) query.set("periodKey", bootstrap.periodKey);
    try {
      const response = await fetch(`/api/vendas/tv?${query}`, {
        headers: { Authorization: `Bearer ${bootstrap.token}` },
        cache: "no-store",
        signal: controller.signal,
        referrerPolicy: "no-referrer",
      });
      const parsed = salesTvSnapshotSchema.safeParse(await response.json());
      if (currentRequest !== requestId.current) return;
      if (!parsed.success || !parsed.data.available) {
        snapshotRef.current = null;
        setSnapshot(null);
        setState("neutral");
        return;
      }
      snapshotRef.current = parsed.data;
      setSnapshot(parsed.data);
      setState("ready");
      setAnnouncement("Painel atualizado");
      refreshMsRef.current = Math.min(
        Math.max(parsed.data.refresh_after_seconds * 1000, 5_000),
        300_000,
      );
      if (
        !parsed.data.empty &&
        !parsed.data.celebration.available &&
        "receipt_state" in parsed.data.celebration &&
        parsed.data.celebration.receipt_state === "ACKNOWLEDGED"
      ) {
        seenReceipts.current.delete(claimReceipt);
        receiptRef.current = receipt();
      } else if (!parsed.data.empty && parsed.data.celebration.available) {
        const eventReceipt = parsed.data.celebration.receipt;
        if (!seenReceipts.current.has(eventReceipt)) {
          seenReceipts.current.add(eventReceipt);
          setAnnouncement("Meta coletiva atingida");
          playCelebration();
        }
        await fetch("/api/vendas/tv", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${bootstrap.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ receipt: eventReceipt }),
          cache: "no-store",
          referrerPolicy: "no-referrer",
        });
      }
    } catch {
      if (currentRequest !== requestId.current) return;
      setState((previous) =>
        snapshotRef.current
          ? "offline"
          : previous === "loading"
            ? "neutral"
            : previous,
      );
    }
  }, [bootstrap, playCelebration]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    const poll = async () => {
      await load();
      if (!disposed) timer = setTimeout(poll, refreshMsRef.current);
    };
    void poll();
    return () => {
      disposed = true;
      requestId.current += 1;
      controllerRef.current?.abort();
      if (timer) clearTimeout(timer);
      soundEnabledRef.current = false;
      const context = audioContext.current;
      audioContext.current = null;
      if (context && context.state !== "closed") void context.close();
    };
  }, [load]);

  async function enableSound() {
    try {
      const context = new AudioContext();
      await context.resume();
      audioContext.current = context;
      soundEnabledRef.current = true;
      setSoundEnabled(true);
      setSoundUnavailable(false);
    } catch {
      setSoundUnavailable(true);
    }
  }

  if (state === "loading")
    return <TvState title="Carregando painel coletivo" loading />;
  if (state === "neutral" || !snapshot) {
    return (
      <TvState
        title="Este painel não está disponível"
        description="Solicite um novo acesso ao administrador."
        retry={load}
      />
    );
  }
  if (!snapshot.available) {
    return (
      <TvState
        title="Este painel não está disponível"
        description="Solicite um novo acesso ao administrador."
        retry={load}
      />
    );
  }
  if (snapshot.empty) {
    return (
      <TvState
        title="Sem agregado coletivo autorizado para este período"
        description="O painel será atualizado automaticamente."
        retry={load}
      />
    );
  }

  const band = {
    BUILDING: {
      label: "Construindo ritmo",
      status: "neutral" as const,
      icon: Gauge,
    },
    ALERT: {
      label: "Rumo à meta",
      status: "warning" as const,
      icon: TrendingUp,
    },
    ACHIEVED: {
      label: "Meta coletiva atingida",
      status: "success" as const,
      icon: CheckCircle2,
    },
  }[snapshot.progress.band];
  const BandIcon = band.icon;
  const direction = snapshot.comparison.available
    ? { ABOVE: "acima", BELOW: "abaixo", STABLE: "estável" }[
        snapshot.comparison.direction
      ]
    : null;

  return (
    <main className="tv-premium bg-background text-foreground min-h-dvh overflow-x-hidden p-4 sm:p-8 lg:p-12">
      <div className="mx-auto flex min-h-[calc(100dvh-2rem)] max-w-7xl flex-col gap-5 sm:min-h-[calc(100dvh-4rem)]">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-muted-foreground text-sm font-semibold tracking-[0.22em] uppercase">
              LISION Vendas
            </p>
            <h1 className="text-2xl font-semibold sm:text-3xl">
              Painel coletivo
            </h1>
          </div>
          <StatusBadge
            status={state === "offline" ? "warning" : "success"}
            size="md"
          >
            {state === "offline"
              ? "Offline · dados desatualizados"
              : "Painel coletivo atualizado"}
          </StatusBadge>
        </header>

        <Card className="bg-card flex flex-1 flex-col items-center justify-center gap-5 py-8 text-center">
          <p className="text-muted-foreground text-base">
            {snapshot.period.starts_on} a {snapshot.period.ends_on} ·{" "}
            {snapshot.period.status === "OPEN" ? "Atual" : "Histórico"}
          </p>
          {/* Herói: medidor radial premium do Lision (mesmo componente da TV de produção),
              em modo percentual da meta coletiva. */}
          <RadialGauge
            produced={Math.round(snapshot.progress.percent)}
            target={100}
            percent={snapshot.progress.percent}
            unit="%"
            state={BAND_STATE[snapshot.progress.band]}
          />
          <StatusBadge
            className="text-sm"
            status={band.status}
            size="md"
            icon={<BandIcon aria-hidden="true" className="h-4 w-4" />}
          >
            {band.label}
          </StatusBadge>
        </Card>

        <section
          className="grid gap-5 md:grid-cols-2"
          aria-label="Ritmo e comparação"
        >
          <Card>
            <CardHeader>
              <CardTitle>Ritmo coletivo</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Metric
                label="Atingido"
                value={`${percent(snapshot.progress.percent)}%`}
              />
              <Metric
                label="Ritmo ideal"
                value={`${percent(snapshot.progress.ideal_pace_percent)}%`}
              />
              <Metric
                label="Necessário por dia útil"
                value={`${percent(snapshot.progress.necessary_per_business_day_percent)}%`}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Em relação ao período anterior</CardTitle>
            </CardHeader>
            <CardContent>
              {snapshot.comparison.available ? (
                <div className="flex items-center gap-3">
                  {snapshot.comparison.direction === "BELOW" ? (
                    <TrendingDown aria-hidden="true" />
                  ) : (
                    <TrendingUp aria-hidden="true" />
                  )}
                  <p className="text-2xl font-semibold tabular-nums">
                    {percent(snapshot.comparison.delta_percent)}% {direction}
                  </p>
                </div>
              ) : (
                <p className="text-muted-foreground">
                  Comparação anterior não disponível.
                </p>
              )}
            </CardContent>
          </Card>
        </section>

        {snapshot.celebration.available && (
          <Card className="motion-safe:animate-in" aria-live="polite">
            <CardContent className="py-6 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8" aria-hidden="true" />
              <p className="mt-2 text-xl font-semibold">
                Meta coletiva atingida
              </p>
              <p className="text-muted-foreground">
                Celebração coletiva confirmada.
              </p>
            </CardContent>
          </Card>
        )}
        <footer className="text-muted-foreground flex flex-wrap items-center justify-between gap-3 text-sm">
          <p>
            Última atualização:{" "}
            {new Date(snapshot.updated_at).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          <Button
            className="min-h-11"
            variant="outline"
            onClick={
              soundEnabled
                ? () => {
                    soundEnabledRef.current = false;
                    setSoundEnabled(false);
                    const context = audioContext.current;
                    audioContext.current = null;
                    if (context && context.state !== "closed")
                      void context.close();
                  }
                : enableSound
            }
          >
            {soundEnabled ? "Desativar som" : "Ativar som das celebrações"}
          </Button>
          {soundUnavailable && (
            <p>Som indisponível; celebração visual mantida.</p>
          )}
        </footer>
        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function TvState({
  title,
  description,
  loading,
  retry,
}: {
  title: string;
  description?: string;
  loading?: boolean;
  retry?: () => void;
}) {
  return (
    <main className="tv-premium bg-background text-foreground flex min-h-dvh items-center justify-center p-4">
      <Card
        className="w-full max-w-xl text-center"
        role={loading ? "status" : undefined}
      >
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{description}</p>
          {loading && (
            <div className="bg-muted mx-auto mt-5 h-2 w-40 rounded motion-safe:animate-pulse" />
          )}
          {retry && (
            <Button className="mt-6 min-h-11" onClick={() => void retry()}>
              Tentar novamente
            </Button>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

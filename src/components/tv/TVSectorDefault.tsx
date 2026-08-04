"use client";

import type { CSSProperties } from "react";
import { Clock, Gauge, Truck, Users } from "lucide-react";
import type { SectorKpis } from "@/lib/sector-kpis";
import { displayUnit } from "@/lib/utils";
import { CountUp } from "@/components/ui/count-up";
import { RadialGauge } from "@/components/tv/instrument/RadialGauge";
import { MiniRing } from "@/components/tv/instrument/MiniRing";
import { TVWaveChart } from "@/components/tv/instrument/TVWaveChart";
import { GlassPanel, PanelLabel } from "@/components/tv/instrument/GlassPanel";
import { STATE_COLORS, paceFromPercent, paceFromHourPercent, HOUR_HIT_GOLD, nf } from "@/components/tv/instrument/state";

/**
 * Frente 4 — Visão por SETOR, redesign "Instrumento" (design aprovado).
 * Herói = medidor radial da meta do momento; ao redor, anéis de período, KPIs
 * de ritmo/tempo, onda de produção, ranking e status da facção. O GLOW ambiente
 * da sala responde ao estado (verde/âmbar/vermelho) — a cor antes do número.
 *
 * Vale para TODOS os setores (a página sempre renderiza este layout).
 */

const AREAS = `
  "hero hero metas metas"
  "hero hero kpis  kpis"
  "wave wave rank  fac"
`;

/** Sem o painel de facção, o ranking ocupa as duas colunas — sem buraco no grid. */
const AREAS_NO_FACTION = `
  "hero hero metas metas"
  "hero hero kpis  kpis"
  "wave wave rank  rank"
`;

const gridStyle: CSSProperties = {
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gridTemplateRows: "minmax(0,1fr) minmax(0,0.6fr) minmax(0,0.95fr)",
  gridTemplateAreas: AREAS,
};

const gridStyleNoFaction: CSSProperties = { ...gridStyle, gridTemplateAreas: AREAS_NO_FACTION };

function fmtMin(min: number | null | undefined): string {
  if (min == null) return "—";
  if (min < 60) return `${Math.round(min)}min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

function pctOf(p: { target: number | null; progress: number } | undefined): number {
  if (!p || p.target == null || p.target <= 0) return 0;
  return Math.round((p.progress / p.target) * 100);
}

export function TVSectorDefault({
  kpis,
  showFaction = true,
}: {
  kpis: SectorKpis | null;
  /** Config por setor: esconde o painel de facção onde ele não faz sentido. */
  showFaction?: boolean;
}) {
  const percent = kpis?.percent ?? 0;
  const state = paceFromPercent(percent);
  const color = STATE_COLORS[state];
  const unit = displayUnit(kpis?.unit);

  const distance = kpis?.distance_daily ?? 0;
  const done = kpis != null && kpis.daily_target != null && distance <= 0;
  const statusDetail = done ? "META BATIDA 🎉" : `FALTAM ${nf(distance)}${unit ? ` ${unit}` : ""}`;

  // Ritmo/h: produção acumulada ÷ horas decorridas desde a 1ª bipagem.
  const elapsedMin = kpis?.elapsed_since_first_scan_min ?? null;
  const rate = elapsedMin && elapsedMin > 0 && kpis ? Math.round((kpis.produced / (elapsedMin / 60)) * 10) / 10 : null;

  const dayPct = percent; // % da meta diária — vira MiniRing "Dia" quando o herói é a hora
  const weekPct = pctOf(kpis?.weekly);
  const monthPct = pctOf(kpis?.monthly);

  // Frente 3 — meta por hora (herói condicional). Sem jornada configurada → herói = dia (atual).
  const heroIsHour = !!kpis?.hero_is_hour;
  const hourPct = kpis?.hourly_percent ?? 0;
  const hourState = paceFromHourPercent(hourPct);
  const hourHit = hourPct >= 100;
  const hourColor = STATE_COLORS[hourState];
  // Glow ambiente e status seguem o HERÓI (hora quando configurada; dia caso contrário).
  const heroColor = heroIsHour ? (hourHit ? { ...hourColor, ...HOUR_HIT_GOLD } : hourColor) : color;
  const metaPorHora = kpis?.hourly_target ?? undefined; // linha "Meta/h" da onda usa a meta real

  return (
    <div className="relative h-full min-h-0 w-full">
      {/* Glow ambiente — a sala "muda de cor" com o estado */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(60% 55% at 30% 0%, ${heroColor.glow} 0%, transparent 60%)`,
          opacity: 0.5,
          transition: "background 0.8s ease, opacity 0.8s ease",
        }}
      />

      <div className="relative grid h-full min-h-0 w-full gap-5" style={showFaction ? gridStyle : gridStyleNoFaction}>
        {/* ── HERÓI: anel da HORA (se jornada configurada) OU do DIA (fallback atual) ── */}
        <div className="flex min-h-0 min-w-0 flex-col items-center justify-center gap-4" style={{ gridArea: "hero" }}>
          {heroIsHour ? (
            <>
              <span className="font-display uppercase text-muted-foreground" style={{ fontSize: "clamp(0.7rem,1.5vh,1rem)", fontWeight: 700, letterSpacing: "0.14em" }}>
                {kpis?.hour_window_label}
              </span>
              <RadialGauge produced={kpis?.hourly_produced ?? 0} target={kpis?.hourly_target ?? null} percent={hourPct} unit={unit} state={hourState} />
              <div
                className="flex items-center gap-2.5 rounded-full border px-5 py-2"
                style={{ background: heroColor.soft, borderColor: heroColor.main, color: heroColor.main }}
              >
                <span className="size-2.5 rounded-full tv-live-ping-dot" style={{ background: heroColor.main }} />
                <span className="font-display uppercase tabular-nums" style={{ fontSize: "clamp(0.8rem,1.9vh,1.15rem)", fontWeight: 800, letterSpacing: "0.1em" }}>
                  {hourHit ? "HORA BATIDA 🎉" : `NA HORA — FALTAM ${nf(Math.max(0, (kpis?.hourly_target ?? 0) - (kpis?.hourly_produced ?? 0)))}`}
                </span>
              </div>
              <HourPipsStrip hit={kpis?.hours_hit_today ?? 0} total={kpis?.working_hours_today ?? 0} />
            </>
          ) : (
            <>
              <RadialGauge produced={kpis?.produced ?? 0} target={kpis?.daily_target ?? null} percent={percent} unit={unit} state={state} />
              <div
                className="flex items-center gap-2.5 rounded-full border px-5 py-2"
                style={{ background: color.soft, borderColor: color.main, color: color.main }}
              >
                <span className="size-2.5 rounded-full tv-live-ping-dot" style={{ background: color.main }} />
                <span className="font-display uppercase tabular-nums" style={{ fontSize: "clamp(0.8rem,1.9vh,1.15rem)", fontWeight: 800, letterSpacing: "0.1em" }}>
                  {color.label} — {statusDetail}
                </span>
              </div>
            </>
          )}
        </div>

        {/* ── Metas de período (anéis) ── */}
        <GlassPanel area="metas" className="items-stretch p-5">
          <PanelLabel>Metas do Período</PanelLabel>
          <div className="flex flex-1 items-center justify-around gap-4">
            {heroIsHour && (
              <div className="flex flex-col items-center gap-1">
                <MiniRing label="Dia" percent={dayPct} />
                <span className="font-display tabular-nums text-muted-foreground/70" style={{ fontSize: "clamp(0.6rem,1.1vh,0.72rem)" }}>
                  {nf(kpis?.produced ?? 0)} / {kpis?.daily_target != null ? nf(kpis.daily_target) : "—"}
                </span>
              </div>
            )}
            <div className="flex flex-col items-center gap-1">
              <MiniRing label="Semana" percent={weekPct} estimated={kpis?.weekly.estimated} />
              <span className="font-display tabular-nums text-muted-foreground/70" style={{ fontSize: "clamp(0.6rem,1.1vh,0.72rem)" }}>
                {nf(kpis?.weekly.progress ?? 0)} / {kpis?.weekly.target != null ? nf(kpis.weekly.target) : "—"}
              </span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <MiniRing label="Mês" percent={monthPct} estimated={kpis?.monthly.estimated} />
              <span className="font-display tabular-nums text-muted-foreground/70" style={{ fontSize: "clamp(0.6rem,1.1vh,0.72rem)" }}>
                {nf(kpis?.monthly.progress ?? 0)} / {kpis?.monthly.target != null ? nf(kpis.monthly.target) : "—"}
              </span>
            </div>
          </div>
        </GlassPanel>

        {/* ── KPIs: ritmo + tempo ── */}
        <div className="grid min-h-0 grid-cols-2 gap-5" style={{ gridArea: "kpis" }}>
          <GlassPanel className="justify-between p-5">
            <PanelLabel><Gauge className="mr-1.5 inline size-3.5 -translate-y-px" />Ritmo</PanelLabel>
            <div className="flex items-baseline gap-1.5">
              <span className="font-display tabular-nums leading-none text-foreground" style={{ fontSize: "clamp(1.8rem,4.5vh,3rem)", fontWeight: 800 }}>
                {rate != null ? <CountUp value={rate} /> : "—"}
              </span>
              <span className="font-display uppercase text-muted-foreground" style={{ fontSize: "clamp(0.7rem,1.4vh,0.95rem)", fontWeight: 600, letterSpacing: "0.08em" }}>/h</span>
            </div>
          </GlassPanel>
          <GlassPanel className="justify-between p-5">
            <PanelLabel><Clock className="mr-1.5 inline size-3.5 -translate-y-px" />Tempo / Lote</PanelLabel>
            <div>
              <span className="font-display tabular-nums leading-none text-foreground" style={{ fontSize: "clamp(1.8rem,4.5vh,3rem)", fontWeight: 800 }}>
                {fmtMin(kpis?.avg_per_lot_min)}
              </span>
              <p className="mt-1 font-display text-muted-foreground/70" style={{ fontSize: "clamp(0.62rem,1.2vh,0.8rem)" }}>
                Decorrido: {fmtMin(elapsedMin)}
              </p>
            </div>
          </GlassPanel>
        </div>

        {/* ── Onda de produção ── */}
        <GlassPanel area="wave" className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <PanelLabel>Produção por Hora</PanelLabel>
            <span className="font-display uppercase text-muted-foreground/70" style={{ fontSize: "clamp(0.58rem,1.1vh,0.72rem)", letterSpacing: "0.12em" }}>Hoje</span>
          </div>
          <TVWaveChart data={kpis?.hourly ?? []} metaPorHora={metaPorHora} state={state} />
        </GlassPanel>

        {/* ── Ranking do setor ── */}
        <GlassPanel area="rank" className="p-5">
          <PanelLabel><Users className="mr-1.5 inline size-3.5 -translate-y-px" />Ranking do Setor</PanelLabel>
          <RankingList kpis={kpis} />
        </GlassPanel>

        {/* ── Status da facção (escondível por setor na Config. da TV) ── */}
        {showFaction && (
          <GlassPanel area="fac" className="justify-between p-5">
            <PanelLabel><Truck className="mr-1.5 inline size-3.5 -translate-y-px" />Status da Facção</PanelLabel>
            <FactionBlock kpis={kpis} />
          </GlassPanel>
        )}
      </div>
    </div>
  );
}

/* ── Frente 3: tira de horas batidas ("★ X/Y" + pips), legível de longe ── */
function HourPipsStrip({ hit, total }: { hit: number; total: number }) {
  if (total <= 0) return null;
  const gold = HOUR_HIT_GOLD.main;
  return (
    <div className="flex items-center gap-3">
      <span className="font-display tabular-nums" style={{ fontSize: "clamp(1.1rem,2.6vh,1.7rem)", fontWeight: 800, color: gold }}>
        ★ {hit}/{total}
      </span>
      <div className="flex items-center gap-2">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className="rounded-full"
            style={{
              width: "clamp(11px,1.5vh,16px)",
              height: "clamp(11px,1.5vh,16px)",
              background: i < hit ? gold : "transparent",
              border: `2px solid ${i < hit ? gold : "rgba(255,255,255,0.18)"}`,
              boxShadow: i < hit ? `0 0 12px ${HOUR_HIT_GOLD.glow}` : "none",
            }}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Ranking (top 3 do setor hoje) ── */
const MEDALS = ["🥇", "🥈", "🥉"];
function initialsOf(name: string): string {
  const w = name.trim().split(/\s+/);
  return (w.length >= 2 ? w[0][0] + w[1][0] : name.slice(0, 2)).toUpperCase();
}

function RankingList({ kpis }: { kpis: SectorKpis | null }) {
  const rows = kpis?.top_collaborators ?? [];
  if (rows.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
        <p className="font-display text-[14px] font-medium text-muted-foreground">Sem bipagens hoje</p>
        <p className="text-[12px] text-muted-foreground/60">O ranking aparece quando a equipe produz.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col justify-center gap-3">
      {rows.map((c, i) => (
        <div key={c.name + i} className="flex items-center gap-3">
          <span className="w-6 shrink-0 text-center" style={{ fontSize: "clamp(1rem,2vh,1.35rem)" }}>{MEDALS[i] ?? `${i + 1}º`}</span>
          <span className="grid size-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.06] font-display text-[13px] font-semibold">
            {initialsOf(c.name)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate font-display" style={{ fontSize: "clamp(0.85rem,1.7vh,1.05rem)", fontWeight: 600 }}>{c.name}</span>
              <span className="shrink-0 font-display tabular-nums" style={{ fontSize: "clamp(0.9rem,1.8vh,1.15rem)", fontWeight: 800 }}><CountUp value={c.produced} /></span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full"
                style={{ width: `${c.pct}%`, background: i === 0 ? "#fafafa" : "rgba(255,255,255,0.35)", transition: "width 1.3s cubic-bezier(0.22,1,0.36,1)" }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Status da facção ── */
const FACTION_THEME = {
  on_time: { label: "No prazo", color: "#10b981" },
  at_risk: { label: "Em risco", color: "#f59e0b" },
  late: { label: "Atrasado", color: "#ef4444" },
} as const;

function FactionBlock({ kpis }: { kpis: SectorKpis | null }) {
  const fs = kpis?.faction_status;
  if (!fs) {
    return <p className="font-display text-muted-foreground/60" style={{ fontSize: "clamp(0.8rem,1.6vh,1rem)" }}>Sem remessa vigente</p>;
  }
  const theme = FACTION_THEME[fs.status];
  const remaining = fs.hours_remaining < 0 ? `${fmtMin(Math.abs(fs.hours_remaining) * 60)} atrasado` : `faltam ${fmtMin(fs.hours_remaining * 60)}`;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2.5">
        <span className="size-3 rounded-full tv-live-ping-dot" style={{ background: theme.color }} />
        <span className="font-display" style={{ fontSize: "clamp(1.3rem,3vh,2rem)", fontWeight: 800, color: theme.color }}>{theme.label}</span>
      </div>
      <p className="truncate font-display text-muted-foreground" style={{ fontSize: "clamp(0.72rem,1.4vh,0.92rem)" }}>{fs.faction_name} · {remaining}</p>
    </div>
  );
}

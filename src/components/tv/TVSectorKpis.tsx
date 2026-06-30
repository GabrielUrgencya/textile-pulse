"use client";

import { Clock, Target, TrendingUp, Truck } from "lucide-react";

interface PeriodKpi {
  target: number | null;
  progress: number;
  estimated: boolean;
}
interface FactionStatus {
  status: "on_time" | "at_risk" | "late";
  faction_name: string;
  expected_return_at: string;
  hours_remaining: number;
}
export interface SectorKpisData {
  stage_id: string;
  stage_name: string;
  unit: string | null;
  produced: number;
  daily_target: number | null;
  distance_daily: number;
  percent: number;
  weekly: PeriodKpi;
  monthly: PeriodKpi;
  elapsed_since_first_scan_min: number | null;
  avg_per_lot_min: number | null;
  faction_status: FactionStatus | null;
}

const nf = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

function fmtMin(min: number | null): string {
  if (min == null) return "—";
  if (min < 60) return `${Math.round(min)}min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

const FACTION_THEME: Record<FactionStatus["status"], { label: string; cls: string; dot: string }> = {
  on_time: { label: "No prazo", cls: "text-success", dot: "bg-success" },
  at_risk: { label: "Em risco", cls: "text-warning", dot: "bg-warning" },
  late: { label: "Atrasado", cls: "text-destructive", dot: "bg-destructive" },
};

/**
 * Story 8.35 — KPIs do setor selecionado na TV (tempo real via polling).
 * 2a meta do momento + barra · 2b distância (diária + semanal/mensal) ·
 * 2c tempo de processo · 2d status da facção.
 */
export function TVSectorKpis({ data, unit: unitProp }: { data: SectorKpisData; unit?: string | null }) {
  const unit = (unitProp ?? data.unit ?? "un").trim() || "un";
  const pct = Math.min(100, Math.max(0, data.percent));
  const hasDaily = data.daily_target != null && data.daily_target > 0;
  const done = hasDaily && data.distance_daily <= 0;

  return (
    <div className="rounded-2xl bg-card/60 border border-border/50 p-4 flex flex-col gap-3">
      {/* Cabeçalho do setor */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Setor · {data.stage_name}</span>
        <span className="font-mono tabular-nums text-[11px] text-muted-foreground">{pct.toFixed(0)}%</span>
      </div>

      {/* 2a — Meta do momento + barra */}
      <div>
        <div className="flex items-baseline gap-2">
          <span className="font-display text-[40px] leading-none font-semibold tabular-nums">{nf(data.produced)}</span>
          <span className="text-[13px] text-muted-foreground">/ {hasDaily ? nf(data.daily_target as number) : "—"} {unit}</span>
        </div>
        <div className="mt-2 h-2.5 rounded-full bg-secondary/60 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${done ? "bg-success" : "bg-primary"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        {/* 2b — Distância da meta diária */}
        <div className="mt-1.5 flex items-center gap-1.5 text-[12px]">
          <Target className="size-3.5 text-muted-foreground" />
          {done ? (
            <span className="text-success font-medium">Meta do dia batida 🎉</span>
          ) : hasDaily ? (
            <span className="text-muted-foreground">Faltam <span className="text-foreground font-semibold">{nf(data.distance_daily)}</span> {unit} para a meta do dia</span>
          ) : (
            <span className="text-muted-foreground">Meta diária não configurada</span>
          )}
        </div>
      </div>

      {/* 2b secundárias — semanal/mensal */}
      <div className="grid grid-cols-2 gap-2">
        <PeriodChip label="Semana" kpi={data.weekly} unit={unit} />
        <PeriodChip label="Mês" kpi={data.monthly} unit={unit} />
      </div>

      {/* 2c — Tempo de processo + 2d — Facção */}
      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/40">
        <div className="flex flex-col gap-0.5">
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground"><Clock className="size-3" /> Tempo de processo</span>
          <span className="text-[13px]">Decorrido: <span className="font-medium tabular-nums">{fmtMin(data.elapsed_since_first_scan_min)}</span></span>
          <span className="text-[12px] text-muted-foreground">Médio/lote: <span className="tabular-nums">{fmtMin(data.avg_per_lot_min)}</span></span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground"><Truck className="size-3" /> Facção</span>
          {data.faction_status ? (
            <FactionBlock fs={data.faction_status} />
          ) : (
            <span className="text-[12px] text-muted-foreground/60">Sem remessa vigente</span>
          )}
        </div>
      </div>
    </div>
  );
}

function PeriodChip({ label, kpi, unit }: { label: string; kpi: PeriodKpi; unit: string }) {
  const pct = kpi.target && kpi.target > 0 ? Math.min(100, Math.round((kpi.progress / kpi.target) * 100)) : 0;
  return (
    <div className="rounded-lg bg-secondary/40 px-2.5 py-1.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1 text-muted-foreground"><TrendingUp className="size-3" /> {label}</span>
        {kpi.estimated && <span className="text-[9px] text-muted-foreground/50 uppercase">est.</span>}
      </div>
      <div className="text-[12px] tabular-nums mt-0.5">
        {nf(kpi.progress)} / {kpi.target != null ? nf(kpi.target) : "—"} {unit}
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-background/60 overflow-hidden">
        <div className="h-full rounded-full bg-muted-foreground/40" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function FactionBlock({ fs }: { fs: FactionStatus }) {
  const theme = FACTION_THEME[fs.status];
  const h = fs.hours_remaining;
  const remaining = h < 0
    ? `${fmtMin(Math.abs(h) * 60)} atrasado`
    : `faltam ${fmtMin(h * 60)}`;
  return (
    <>
      <span className={`flex items-center gap-1.5 text-[13px] font-medium ${theme.cls}`}>
        <span className={`size-2 rounded-full ${theme.dot}`} /> {theme.label}
      </span>
      <span className="text-[12px] text-muted-foreground truncate">{fs.faction_name} · {remaining}</span>
    </>
  );
}

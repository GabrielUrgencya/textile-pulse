"use client";

import * as React from "react";
import { Download, Loader2, FileSpreadsheet } from "lucide-react";
import { LisionCard, LisionCardHeader } from "@/components/ui/lision-card";
import { showToast } from "@/lib/toast";

/**
 * Frente B — Download de relatório de produção por período.
 * Presets (Hoje, 7/30/90 dias) + período custom + granularidade
 * (Diário/Semanal/Mensal/Anual). Baixa CSV de /api/reports/production.
 */

function ymd(d: Date): string {
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return ymd(d);
}

type Granularity = "day" | "week" | "month" | "year";

const PRESETS: { label: string; from: () => string; to: () => string }[] = [
  { label: "Hoje", from: () => ymd(new Date()), to: () => ymd(new Date()) },
  { label: "Últimos 7 dias", from: () => daysAgo(6), to: () => ymd(new Date()) },
  { label: "Últimos 30 dias", from: () => daysAgo(29), to: () => ymd(new Date()) },
  { label: "Últimos 90 dias", from: () => daysAgo(89), to: () => ymd(new Date()) },
];

const GRANULARITIES: { value: Granularity; label: string }[] = [
  { value: "day", label: "Diário" },
  { value: "week", label: "Semanal" },
  { value: "month", label: "Mensal" },
  { value: "year", label: "Anual" },
];

export function ReportDownloadCard() {
  const [from, setFrom] = React.useState(daysAgo(29));
  const [to, setTo] = React.useState(ymd(new Date()));
  const [granularity, setGranularity] = React.useState<Granularity>("day");
  const [downloading, setDownloading] = React.useState(false);

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    setFrom(p.from());
    setTo(p.to());
  };

  const download = async () => {
    if (!from || !to) { showToast("error", "Selecione o período"); return; }
    if (from > to) { showToast("error", "Data inicial maior que a final"); return; }
    setDownloading(true);
    try {
      const qs = new URLSearchParams({ from, to, granularity, format: "csv" }).toString();
      const res = await fetch(`/api/reports/production?${qs}`, { credentials: "same-origin" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Falha ao gerar relatório");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lision-relatorio-${from}_${to}-${granularity}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast("success", "Relatório baixado");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Erro ao baixar relatório");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <LisionCard>
      <LisionCardHeader
        eyebrow="Relatórios"
        title="Baixar relatório de produção"
        right={<FileSpreadsheet className="size-4 text-muted-foreground/60" />}
      />

      {/* Presets */}
      <div className="flex flex-wrap gap-2 mb-4">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => applyPreset(p)}
            className="h-8 px-3 rounded-lg text-[12px] font-medium bg-secondary/50 border border-border/50 hover:bg-secondary transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Período custom + granularidade */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">De</span>
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="input-field" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Até</span>
          <input type="date" value={to} min={from} max={ymd(new Date())} onChange={(e) => setTo(e.target.value)} className="input-field" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Agrupar por</span>
          <select value={granularity} onChange={(e) => setGranularity(e.target.value as Granularity)} className="input-field">
            {GRANULARITIES.map((g) => (
              <option key={g.value} value={g.value}>{g.label}</option>
            ))}
          </select>
        </label>
      </div>

      <button
        type="button"
        onClick={download}
        disabled={downloading}
        className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-foreground text-background font-medium hover:opacity-90 transition-opacity text-[13px] disabled:opacity-50"
      >
        {downloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        Baixar relatório (CSV)
      </button>
      <p className="text-[11px] text-muted-foreground/70 mt-2">
        Produção (peças concluídas) e defeitos no período. Formato CSV, abre no Excel/Sheets.
      </p>
    </LisionCard>
  );
}

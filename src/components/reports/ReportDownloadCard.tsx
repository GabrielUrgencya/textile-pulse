"use client";

import * as React from "react";
import { Loader2, FileSpreadsheet, FileText } from "lucide-react";
import { LisionCard, LisionCardHeader } from "@/components/ui/lision-card";
import { showToast } from "@/lib/toast";

/**
 * Frente 1 — Download do relatório de produção profissional.
 * Presets + período custom. Dois formatos: Excel (.xlsx, análise) e PDF (apresentação).
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

const PRESETS: { label: string; from: () => string; to: () => string }[] = [
  { label: "Hoje", from: () => ymd(new Date()), to: () => ymd(new Date()) },
  { label: "Últimos 7 dias", from: () => daysAgo(6), to: () => ymd(new Date()) },
  { label: "Últimos 30 dias", from: () => daysAgo(29), to: () => ymd(new Date()) },
  { label: "Últimos 90 dias", from: () => daysAgo(89), to: () => ymd(new Date()) },
];

type Format = "xlsx" | "pdf";

export function ReportDownloadCard() {
  const [from, setFrom] = React.useState(daysAgo(29));
  const [to, setTo] = React.useState(ymd(new Date()));
  const [downloading, setDownloading] = React.useState<Format | null>(null);

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    setFrom(p.from());
    setTo(p.to());
  };

  const download = async (format: Format) => {
    if (!from || !to) { showToast("error", "Selecione o período"); return; }
    if (from > to) { showToast("error", "Data inicial maior que a final"); return; }
    setDownloading(format);
    try {
      const qs = new URLSearchParams({ from, to, format }).toString();
      const res = await fetch(`/api/reports/production?${qs}`, { credentials: "same-origin" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Falha ao gerar relatório");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lision-relatorio-${from}_${to}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast("success", `Relatório ${format.toUpperCase()} baixado`);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Erro ao baixar relatório");
    } finally {
      setDownloading(null);
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

      {/* Período custom */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">De</span>
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="input-field" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Até</span>
          <input type="date" value={to} min={from} max={ymd(new Date())} onChange={(e) => setTo(e.target.value)} className="input-field" />
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => download("xlsx")}
          disabled={downloading !== null}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-foreground text-background font-medium hover:opacity-90 transition-opacity text-[13px] disabled:opacity-50"
        >
          {downloading === "xlsx" ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
          Baixar Excel (.xlsx)
        </button>
        <button
          type="button"
          onClick={() => download("pdf")}
          disabled={downloading !== null}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-border bg-secondary/50 font-medium hover:bg-secondary transition-colors text-[13px] disabled:opacity-50"
        >
          {downloading === "pdf" ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
          Baixar PDF
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground/70 mt-3">
        Produção por setor e operador, meta vs realizado, déficit acumulado e totais. Excel para análise, PDF para apresentação.
      </p>
    </LisionCard>
  );
}

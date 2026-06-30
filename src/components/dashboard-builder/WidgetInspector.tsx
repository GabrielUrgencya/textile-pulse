"use client";

import { Trash2 } from "lucide-react";
import type { KPIWidget, WidgetSize } from "@/lib/dashboard-config";
import { WIDGET_CATALOG } from "@/lib/dashboard-config";

/**
 * Story 8.41 — inspector do widget selecionado. Edita label, metric, tamanho
 * (seletor sm/md/lg/xl — mais confiável que drag-resize) e thresholds.
 */

const SIZES: WidgetSize[] = ["sm", "md", "lg", "xl"];

export function WidgetInspector({
  widget,
  onChange,
  onRemove,
}: {
  widget: KPIWidget | null;
  onChange: (w: KPIWidget) => void;
  onRemove: (id: string) => void;
}) {
  if (!widget) {
    return (
      <div className="text-[12px] text-muted-foreground/60">
        Selecione um widget no preview para editar.
      </div>
    );
  }

  const set = (patch: Partial<KPIWidget>) => onChange({ ...widget, ...patch });

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80 font-medium">
        Editar widget
      </div>

      <label className="block">
        <span className="text-[11px] text-muted-foreground">Rótulo</span>
        <input
          className="input-field mt-1 w-full"
          value={widget.label}
          onChange={(e) => set({ label: e.target.value })}
        />
      </label>

      <label className="block">
        <span className="text-[11px] text-muted-foreground">Métrica</span>
        <select
          className="input-field mt-1 w-full"
          value={widget.metric}
          onChange={(e) => {
            const entry = WIDGET_CATALOG.find((c) => c.metric === e.target.value);
            set({ metric: e.target.value, type: entry?.type ?? widget.type });
          }}
        >
          {WIDGET_CATALOG.map((c) => (
            <option key={c.metric} value={c.metric}>{c.label}</option>
          ))}
        </select>
      </label>

      <div>
        <span className="text-[11px] text-muted-foreground">Tamanho</span>
        <div className="mt-1 flex gap-1.5">
          {SIZES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => set({ size: s })}
              className={`flex-1 h-8 rounded-lg text-[12px] uppercase font-medium border transition-colors ${
                widget.size === s
                  ? "bg-foreground text-background border-transparent"
                  : "bg-secondary/40 border-border/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="text-[11px] text-muted-foreground">Thresholds (% da meta)</span>
        <div className="mt-1 grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[10px] text-warning">Atenção</span>
            <input
              type="number" min={0} max={100}
              className="input-field mt-0.5 w-full"
              value={widget.thresholds?.warning ?? ""}
              onChange={(e) => {
                const warning = e.target.value === "" ? undefined : Number(e.target.value);
                const critical = widget.thresholds?.critical;
                set({ thresholds: warning == null && critical == null ? undefined : { warning: warning ?? 0, critical: critical ?? 0 } });
              }}
            />
          </label>
          <label className="block">
            <span className="text-[10px] text-destructive">Crítico</span>
            <input
              type="number" min={0} max={100}
              className="input-field mt-0.5 w-full"
              value={widget.thresholds?.critical ?? ""}
              onChange={(e) => {
                const critical = e.target.value === "" ? undefined : Number(e.target.value);
                const warning = widget.thresholds?.warning;
                set({ thresholds: warning == null && critical == null ? undefined : { warning: warning ?? 0, critical: critical ?? 0 } });
              }}
            />
          </label>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onRemove(widget.id)}
        className="mt-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-lg border border-destructive/40 text-destructive hover:bg-destructive/10 transition-colors text-[13px]"
      >
        <Trash2 className="size-3.5" /> Remover widget
      </button>
    </div>
  );
}

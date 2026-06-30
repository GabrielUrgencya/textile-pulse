"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, LayoutGrid, Check } from "lucide-react";

export interface SectorOption {
  id: string;
  name: string;
  display_name: string;
  order_index: number;
}

interface TVSectorSelectorProps {
  sectors: SectorOption[];
  activeId: string | null; // null = Visão Geral
  onChange: (stageId: string | null) => void;
}

const GERAL_LABEL = "Visão Geral";

/**
 * Story 8.34 — seletor de setor na TV. Compacto, no canto, não atrapalha o conteúdo.
 * "Visão Geral" (null) = comportamento atual sem filtro.
 */
export function TVSectorSelector({ sectors, activeId, onChange }: TVSectorSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const active = activeId ? sectors.find((s) => s.id === activeId) : null;
  const activeLabel = active ? active.display_name : GERAL_LABEL;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 h-8 px-3 rounded-lg bg-secondary/60 border border-border hover:bg-secondary transition-colors shrink-0"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <LayoutGrid className="size-3.5 text-muted-foreground" />
        <span className="text-[12px] font-medium max-w-[160px] truncate">{activeLabel}</span>
        <ChevronDown className={`size-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 mt-1.5 w-[220px] max-h-[60vh] overflow-y-auto rounded-xl bg-popover border border-border shadow-xl z-50 py-1.5"
        >
          <SectorItem
            label={GERAL_LABEL}
            selected={!activeId}
            onClick={() => { onChange(null); setOpen(false); }}
          />
          <div className="my-1 h-px bg-border/40" />
          {sectors.map((s) => (
            <SectorItem
              key={s.id}
              label={s.display_name}
              selected={activeId === s.id}
              onClick={() => { onChange(s.id); setOpen(false); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SectorItem({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-secondary/60 transition-colors ${
        selected ? "text-foreground font-medium" : "text-muted-foreground"
      }`}
    >
      <span className="truncate">{label}</span>
      {selected && <Check className="size-3.5 shrink-0" />}
    </button>
  );
}

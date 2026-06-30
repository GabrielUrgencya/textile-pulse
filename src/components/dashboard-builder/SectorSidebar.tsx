"use client";

import { cn } from "@/lib/utils";

export interface BuilderStage {
  id: string;
  name: string;
  display_name: string;
  order_index: number;
}

/**
 * Story 8.41 — sidebar de setores (esquerda). Seleciona um setor → carrega sua config.
 */
export function SectorSidebar({
  stages,
  selectedId,
  onSelect,
  dirty,
}: {
  stages: BuilderStage[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  dirty: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80 font-medium mb-1">
        Setores
      </div>
      {stages.length === 0 && (
        <span className="text-[12px] text-muted-foreground/60">Nenhum setor configurado.</span>
      )}
      {stages.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onSelect(s.id)}
          className={cn(
            "flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition-colors",
            selectedId === s.id
              ? "bg-foreground text-background font-medium"
              : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
          )}
        >
          <span className="truncate">{s.display_name || s.name}</span>
          {dirty && selectedId === s.id && (
            <span className="size-1.5 rounded-full bg-warning shrink-0" title="Alterações não salvas" />
          )}
        </button>
      ))}
    </div>
  );
}

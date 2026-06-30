"use client";

import { useDraggable } from "@dnd-kit/core";
import { GripVertical, Plus } from "lucide-react";
import { WIDGET_CATALOG, type WidgetCatalogEntry } from "@/lib/dashboard-config";

/**
 * Story 8.41 — biblioteca de widgets (direita). Cada item é arrastável p/ o canvas.
 * Também permite adicionar por clique (acessível, sem depender só do drag).
 */
export function WidgetLibrary({ onAdd }: { onAdd: (entry: WidgetCatalogEntry) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80 font-medium mb-1">
        Biblioteca de widgets
      </div>
      {WIDGET_CATALOG.map((entry) => (
        <LibraryItem key={entry.metric} entry={entry} onAdd={onAdd} />
      ))}
      <p className="text-[11px] text-muted-foreground/60 mt-2">
        Arraste para o preview ou clique em + para adicionar.
      </p>
    </div>
  );
}

function LibraryItem({ entry, onAdd }: { entry: WidgetCatalogEntry; onAdd: (e: WidgetCatalogEntry) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `lib:${entry.metric}`,
    data: { kind: "library", entry },
  });
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border border-border/50 bg-secondary/30 px-3 py-2 ${isDragging ? "opacity-40" : ""}`}
    >
      <button
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        className="cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-foreground touch-none"
        aria-label={`Arrastar ${entry.label}`}
      >
        <GripVertical className="size-4" />
      </button>
      <span className="flex-1 text-[13px] truncate">{entry.label}</span>
      <span className="text-[9px] uppercase text-muted-foreground/40">{entry.defaultSize}</span>
      <button
        type="button"
        onClick={() => onAdd(entry)}
        className="text-muted-foreground hover:text-foreground"
        aria-label={`Adicionar ${entry.label}`}
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}

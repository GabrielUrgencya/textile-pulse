"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, rectSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { X, LayoutGrid } from "lucide-react";
import type { KPIWidget } from "@/lib/dashboard-config";
import type { SectorKpis } from "@/lib/sector-kpis";
import { BentoGrid, BentoCell } from "@/components/ui/bento-grid";
import { WidgetRenderer } from "@/components/tv/widgets/WidgetRenderer";
import { EmptyState } from "@/components/ui/data-states";

/**
 * Story 8.41 — canvas de preview (centro). Droppable + sortable (@dnd-kit).
 * WYSIWYG: usa o mesmo WidgetRenderer da TV com kpis de mock.
 */
export function BuilderCanvas({
  layout,
  mockKpis,
  selectedId,
  onSelect,
  onRemove,
}: {
  layout: KPIWidget[];
  mockKpis: SectorKpis;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "canvas" });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-2xl border p-4 min-h-[420px] transition-colors ${
        isOver ? "border-foreground/40 bg-secondary/20" : "border-border/50 bg-background/40"
      }`}
    >
      {layout.length === 0 ? (
        <EmptyState
          icon={<LayoutGrid className="size-8" />}
          title="Preview vazio"
          description="Arraste widgets da biblioteca (direita) ou clique em + para montar a TV deste setor."
          className="py-20"
        />
      ) : (
        <SortableContext items={layout.map((w) => w.id)} strategy={rectSortingStrategy}>
          <BentoGrid mode="responsive">
            {layout.map((widget, i) => (
              <SortableWidget
                key={widget.id}
                widget={widget}
                index={i}
                mockKpis={mockKpis}
                selected={selectedId === widget.id}
                onSelect={onSelect}
                onRemove={onRemove}
              />
            ))}
          </BentoGrid>
        </SortableContext>
      )}
    </div>
  );
}

function SortableWidget({
  widget,
  index,
  mockKpis,
  selected,
  onSelect,
  onRemove,
}: {
  widget: KPIWidget;
  index: number;
  mockKpis: SectorKpis;
  selected: boolean;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: widget.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <BentoCell size={widget.size}>
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        onClick={() => onSelect(widget.id)}
        className={`relative h-full cursor-grab active:cursor-grabbing touch-none rounded-2xl transition-shadow ${
          selected ? "ring-2 ring-foreground/60" : ""
        }`}
      >
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(widget.id); }}
          className="absolute -top-2 -right-2 z-10 size-6 grid place-items-center rounded-full bg-destructive text-destructive-foreground shadow-md hover:scale-110 transition-transform"
          aria-label={`Remover ${widget.label}`}
        >
          <X className="size-3.5" />
        </button>
        <WidgetRenderer widget={widget} kpis={mockKpis} index={index} />
      </div>
    </BentoCell>
  );
}

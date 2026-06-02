"use client";

import * as React from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { LisionCard, LisionCardHeader } from "@/components/ui/lision-card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useServerData } from "@/hooks/use-server-data";
import { showToast } from "@/lib/toast";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Stage {
  id: string;
  name: string;
  color: string | null;
  order_index: number;
}

function SortableStageItem({
  stage,
  index,
  onNameChange,
  onColorChange,
  onDelete,
}: {
  stage: Stage;
  index: number;
  onNameChange: (id: string, name: string) => void;
  onColorChange: (id: string, color: string) => void;
  onDelete: (stage: Stage) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg border border-border/40 bg-secondary/20 transition-all",
        isDragging && "shadow-glow scale-[1.02] opacity-90 z-10",
      )}
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      <span className="text-xs text-muted-foreground/60 w-6 text-center font-mono">
        {index + 1}
      </span>

      <input
        className="input-field flex-1 h-8 text-sm"
        value={stage.name}
        onChange={(e) => onNameChange(stage.id, e.target.value)}
      />

      <input
        type="color"
        className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
        value={stage.color || "#666666"}
        onChange={(e) => onColorChange(stage.id, e.target.value)}
      />

      <button
        type="button"
        onClick={() => onDelete(stage)}
        className="text-muted-foreground/40 hover:text-destructive transition-colors p-1"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

function StageManager() {
  const { data, isLoading, refetch } = useServerData<Stage[]>("/api/settings/stages");
  const [stages, setStages] = React.useState<Stage[]>([]);
  const [deleteTarget, setDeleteTarget] = React.useState<Stage | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout>>();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  React.useEffect(() => {
    if (data) setStages(data);
  }, [data]);

  const saveReorder = React.useCallback((updated: Stage[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const payload = updated.map((s, i) => ({ id: s.id, order_index: i }));
      const res = await fetch("/api/settings/stages/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stages: payload }),
      });
      if (res.ok) showToast("success", "Ordem salva");
      else showToast("error", "Erro ao reordenar");
    }, 1000);
  }, []);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setStages((prev) => {
      const oldIdx = prev.findIndex((s) => s.id === active.id);
      const newIdx = prev.findIndex((s) => s.id === over.id);
      const updated = arrayMove(prev, oldIdx, newIdx);
      saveReorder(updated);
      return updated;
    });
  };

  const handleNameChange = async (id: string, name: string) => {
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
    // Debounced save inline
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      await fetch(`/api/settings/stages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
    }, 1000);
  };

  const handleColorChange = async (id: string, color: string) => {
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, color } : s)));
    await fetch(`/api/settings/stages/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color }),
    });
  };

  const handleAdd = async () => {
    const res = await fetch("/api/settings/stages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Nova Etapa" }),
    });
    if (res.ok) {
      showToast("success", "Etapa criada");
      refetch();
    } else {
      showToast("error", "Erro ao criar etapa");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await fetch(`/api/settings/stages/${deleteTarget.id}`, { method: "DELETE" });
    if (res.ok) {
      showToast("success", "Etapa removida");
      setDeleteTarget(null);
      refetch();
    } else {
      const body = await res.json().catch(() => ({}));
      showToast("error", body.error || "Erro ao remover");
    }
    setDeleting(false);
  };

  if (isLoading) {
    return (
      <LisionCard>
        <Skeleton className="h-6 w-48 mb-6" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      </LisionCard>
    );
  }

  return (
    <>
      <LisionCard>
        <LisionCardHeader
          eyebrow="Produção"
          title="Etapas de Produção"
          right={
            <Button variant="outline" size="sm" onClick={handleAdd} className="gap-1.5">
              <Plus className="size-3.5" />
              Adicionar Etapa
            </Button>
          }
        />

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={stages.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {stages.map((stage, idx) => (
                <SortableStageItem
                  key={stage.id}
                  stage={stage}
                  index={idx}
                  onNameChange={handleNameChange}
                  onColorChange={handleColorChange}
                  onDelete={setDeleteTarget}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {stages.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhuma etapa cadastrada. Clique em &quot;Adicionar Etapa&quot; para começar.
          </p>
        )}
      </LisionCard>

      <ConfirmDialog
        open={!!deleteTarget}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        title={`Remover "${deleteTarget?.name}"?`}
        description="Esta ação não pode ser desfeita."
        consequences={["Se a etapa possui bipagens, a remoção será bloqueada."]}
        confirmLabel="Remover"
        variant="destructive"
        loading={deleting}
      />
    </>
  );
}

export { StageManager };

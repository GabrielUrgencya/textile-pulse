"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { LisionCard, LisionCardHeader } from "@/components/ui/lision-card";
import { Button } from "@/components/ui/button";
import { useServerData } from "@/hooks/use-server-data";
import { showToast } from "@/lib/toast";
import { Skeleton } from "@/components/ui/skeleton";

const UNIT_SUGGESTIONS = ["conjuntos", "peças", "pares", "travetadas", "cortes", "dúzias"];

/**
 * Story 8.23 — Meta diária por processo (etapa), autossuficiente.
 * Reutilizável na aba "Metas" e em "Metas Avançadas".
 * Banco/API: /api/settings/sector-targets (8.21).
 */

interface Stage { id: string; name: string; display_name: string; order_index: number }
interface SectorTarget { stage_id: string; daily_target: number; unit: string | null }

function SectorTargetsCard() {
  const { data: stages, isLoading } = useServerData<Stage[]>("/api/settings/stages");
  const { data: sectorTargets, refetch } = useServerData<SectorTarget[]>("/api/settings/sector-targets");

  const sortedStages = React.useMemo(
    () => [...(stages || [])].sort((a, b) => a.order_index - b.order_index),
    [stages],
  );
  const map = React.useMemo(
    () => new Map((sectorTargets || []).map((s) => [s.stage_id, s])),
    [sectorTargets],
  );

  const [draft, setDraft] = React.useState<Record<string, { target: string; unit: string }>>({});
  const [saving, setSaving] = React.useState<string | null>(null);

  function val(stageId: string) {
    const d = draft[stageId];
    if (d) return d;
    const s = map.get(stageId);
    return { target: s ? String(s.daily_target) : "", unit: s?.unit ?? "" };
  }
  function set(stageId: string, key: "target" | "unit", value: string) {
    setDraft((p) => ({ ...p, [stageId]: { ...val(stageId), [key]: value } }));
  }
  async function save(stageId: string) {
    const v = val(stageId);
    // Campo vazio = remover a meta (limpar e persistir)
    if (v.target.trim() === "") {
      await remove(stageId);
      return;
    }
    const target = parseInt(v.target);
    if (Number.isNaN(target) || target < 0) {
      showToast("error", "Informe uma meta válida");
      return;
    }
    setSaving(stageId);
    try {
      const res = await fetch("/api/settings/sector-targets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage_id: stageId, daily_target: target, unit: v.unit.trim() || null }),
      });
      if (!res.ok) throw new Error();
      showToast("success", "Meta do processo salva");
      refetch();
    } catch {
      showToast("error", "Erro ao salvar");
    } finally {
      setSaving(null);
    }
  }

  async function remove(stageId: string) {
    setSaving(stageId);
    try {
      const res = await fetch(`/api/settings/sector-targets?stage_id=${stageId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      showToast("success", "Meta do processo removida");
      setDraft((p) => { const n = { ...p }; delete n[stageId]; return n; });
      refetch();
    } catch {
      showToast("error", "Erro ao remover");
    } finally {
      setSaving(null);
    }
  }

  return (
    <LisionCard>
      <LisionCardHeader eyebrow="Produção" title="Meta diária por processo" />
      <p className="text-xs text-muted-foreground/70 mb-1">
        Cada processo tem sua própria meta e unidade. Ex: Corte 200 conjuntos, Conferência 100 conjuntos, Travete 2500 travetadas.
      </p>
      <p className="text-[11px] text-muted-foreground/50 mb-4">
        A <strong>unidade</strong> é uma palavra (ex: conjuntos, travetadas) — não um número. Deixe a meta vazia e salve, ou use a lixeira, para remover.
      </p>
      <datalist id="unit-suggestions">
        {UNIT_SUGGESTIONS.map((u) => <option key={u} value={u} />)}
      </datalist>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : sortedStages.length === 0 ? (
        <div className="text-center py-6 text-sm text-muted-foreground">Nenhum processo cadastrado.</div>
      ) : (
        <>
          <div className="grid grid-cols-[1fr_120px_140px_auto] gap-2 px-0.5 mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>Processo</span>
            <span>Meta/dia</span>
            <span>Unidade</span>
            <span></span>
          </div>
          <div className="space-y-2">
            {sortedStages.map((st) => {
              const v = val(st.id);
              return (
                <div key={st.id} className="grid grid-cols-[1fr_120px_140px_auto] gap-2 items-center">
                  <span className="text-[13px] font-medium">{st.display_name}</span>
                  <input
                    type="number"
                    min={0}
                    className="input-field tabular-nums"
                    placeholder="Ex: 200"
                    value={v.target}
                    onChange={(e) => set(st.id, "target", e.target.value)}
                  />
                  <input
                    className="input-field"
                    list="unit-suggestions"
                    placeholder="ex: conjuntos"
                    value={v.unit}
                    onChange={(e) => set(st.id, "unit", e.target.value)}
                  />
                  <div className="flex items-center gap-1">
                    <Button onClick={() => save(st.id)} disabled={saving === st.id} className="h-9">
                      {saving === st.id ? "..." : "Salvar"}
                    </Button>
                    {map.has(st.id) && (
                      <button
                        type="button"
                        onClick={() => remove(st.id)}
                        disabled={saving === st.id}
                        className="h-9 px-2 rounded-md border border-border/60 text-muted-foreground hover:text-destructive hover:bg-secondary/60 transition disabled:opacity-40"
                        title="Remover meta deste processo"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </LisionCard>
  );
}

export { SectorTargetsCard };

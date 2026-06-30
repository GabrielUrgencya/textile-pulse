"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { Lock, Save, Eye, X, Loader2 } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { LisionCard } from "@/components/ui/lision-card";
import { useUserProfile } from "@/hooks/use-user-profile";
import { BentoGrid, BentoCell } from "@/components/ui/bento-grid";
import { WidgetRenderer } from "@/components/tv/widgets/WidgetRenderer";
import { SectorSidebar, type BuilderStage } from "@/components/dashboard-builder/SectorSidebar";
import { WidgetLibrary } from "@/components/dashboard-builder/WidgetLibrary";
import { BuilderCanvas } from "@/components/dashboard-builder/BuilderCanvas";
import { WidgetInspector } from "@/components/dashboard-builder/WidgetInspector";
import { makeWidget, type KPIWidget, type WidgetCatalogEntry } from "@/lib/dashboard-config";
import type { SectorKpis } from "@/lib/sector-kpis";

/* Dados de mock p/ preview WYSIWYG (mesmo renderer da TV). */
const MOCK_KPIS: SectorKpis = {
  stage_id: "preview",
  stage_name: "Pré-visualização",
  unit: "pç",
  produced: 1240,
  daily_target: 1500,
  distance_daily: 260,
  percent: 82.7,
  weekly: { target: 7500, progress: 5200, estimated: false },
  monthly: { target: 30000, progress: 18400, estimated: true },
  elapsed_since_first_scan_min: 312,
  avg_per_lot_min: 18.5,
  faction_status: {
    status: "at_risk",
    faction_name: "Facção Modelo",
    expected_return_at: new Date(Date.now() + 18 * 3600e3).toISOString(),
    hours_remaining: 18,
  },
  hourly: [
    { label: "08h", value: 120 }, { label: "09h", value: 180 }, { label: "10h", value: 240 },
    { label: "11h", value: 210 }, { label: "12h", value: 90 }, { label: "13h", value: 160 },
    { label: "14h", value: 220 }, { label: "15h", value: 200 },
  ],
  top_collaborators: [
    { name: "Ana Souza", produced: 420, pct: 100 },
    { name: "Bruno Lima", produced: 360, pct: 86 },
    { name: "Carla Dias", produced: 290, pct: 69 },
  ],
};

export default function SectorDashboardBuilderPage() {
  const { profile, isLoading: profileLoading } = useUserProfile();

  const [stages, setStages] = useState<BuilderStage[]>([]);
  const [stageId, setStageId] = useState<string | null>(null);
  const [layout, setLayout] = useState<KPIWidget[]>([]);
  const [savedJson, setSavedJson] = useState<string>("[]");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingCfg, setLoadingCfg] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const dirty = useMemo(() => JSON.stringify(layout) !== savedJson, [layout, savedJson]);

  // Carrega setores
  useEffect(() => {
    fetch("/api/settings/stages", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => {
        const list = (j.data || []) as BuilderStage[];
        setStages(list);
        if (list.length && !stageId) setStageId(list[0].id);
      })
      .catch(() => setStages([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Carrega config do setor selecionado
  useEffect(() => {
    if (!stageId) return;
    setLoadingCfg(true);
    setSelectedId(null);
    fetch(`/api/sector-dashboard-config?stage_id=${stageId}`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const l = (j?.data?.layout || []) as KPIWidget[];
        setLayout(l);
        setSavedJson(JSON.stringify(l));
      })
      .catch(() => { setLayout([]); setSavedJson("[]"); })
      .finally(() => setLoadingCfg(false));
  }, [stageId]);

  const addWidget = useCallback((entry: WidgetCatalogEntry) => {
    setLayout((l) => [...l, makeWidget(entry, l.length)]);
  }, []);

  const onDragEnd = useCallback((e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    const data = active.data.current as { kind?: string; entry?: WidgetCatalogEntry } | undefined;
    if (data?.kind === "library" && data.entry) {
      setLayout((l) => [...l, makeWidget(data.entry as WidgetCatalogEntry, l.length)]);
      return;
    }
    if (active.id !== over.id) {
      setLayout((l) => {
        const oldI = l.findIndex((w) => w.id === active.id);
        const newI = l.findIndex((w) => w.id === over.id);
        if (oldI < 0 || newI < 0) return l;
        return arrayMove(l, oldI, newI);
      });
    }
  }, []);

  const updateWidget = useCallback((w: KPIWidget) => {
    setLayout((l) => l.map((x) => (x.id === w.id ? w : x)));
  }, []);

  const removeWidget = useCallback((id: string) => {
    setLayout((l) => l.filter((x) => x.id !== id));
    setSelectedId((s) => (s === id ? null : s));
  }, []);

  const save = useCallback(async () => {
    if (!stageId) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/sector-dashboard-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ stage_id: stageId, layout }),
      });
      if (res.ok) {
        setSavedJson(JSON.stringify(layout));
        setFeedback("Publicado! A TV deste setor atualiza em instantes.");
      } else {
        const j = await res.json().catch(() => null);
        setFeedback(j?.error || "Falha ao salvar.");
      }
    } catch {
      setFeedback("Erro de conexão.");
    } finally {
      setSaving(false);
    }
  }, [stageId, layout]);

  // Guard admin
  if (!profileLoading && profile && profile.role !== "ADMIN") {
    return (
      <div className="max-w-[900px] mx-auto px-6 py-16 text-center">
        <Lock className="size-10 mx-auto text-muted-foreground/40 mb-3" />
        <h2 className="text-[18px] font-semibold">Acesso restrito</h2>
        <p className="text-[13px] text-muted-foreground mt-1">Este módulo é exclusivo para administradores.</p>
      </div>
    );
  }

  const selectedWidget = layout.find((w) => w.id === selectedId) ?? null;

  return (
    <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-6 lg:py-8">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <PageHeader eyebrow="Tela de TV" title="Configuração de KPIs por Setor" />
        <div className="flex items-center gap-2">
          {feedback && <span className="text-[12px] text-muted-foreground">{feedback}</span>}
          <button
            type="button"
            onClick={() => setPreview(true)}
            disabled={layout.length === 0}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-secondary/60 border border-border/50 hover:bg-secondary transition-colors text-[13px] disabled:opacity-50"
          >
            <Eye className="size-4" /> Preview
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving || !stageId}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-foreground text-background font-medium hover:opacity-90 transition-opacity text-[13px] disabled:opacity-40"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Salvar e publicar
          </button>
        </div>
      </div>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="mt-6 grid grid-cols-12 gap-4">
          {/* Sidebar de setores */}
          <LisionCard className="col-span-12 lg:col-span-2">
            <SectorSidebar stages={stages} selectedId={stageId} onSelect={setStageId} dirty={dirty} />
          </LisionCard>

          {/* Canvas/preview */}
          <div className="col-span-12 lg:col-span-7">
            {loadingCfg ? (
              <div className="h-[420px] rounded-2xl bg-secondary/30 animate-pulse" />
            ) : (
              <BuilderCanvas
                layout={layout}
                mockKpis={MOCK_KPIS}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onRemove={removeWidget}
              />
            )}
          </div>

          {/* Biblioteca + inspector */}
          <div className="col-span-12 lg:col-span-3 flex flex-col gap-4">
            <LisionCard>
              <WidgetLibrary onAdd={addWidget} />
            </LisionCard>
            <LisionCard>
              <WidgetInspector widget={selectedWidget} onChange={updateWidget} onRemove={removeWidget} />
            </LisionCard>
          </div>
        </div>
      </DndContext>

      {/* Preview em tamanho TV */}
      {preview && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[13px] text-muted-foreground">Pré-visualização (tamanho TV) — dados de exemplo</span>
            <button type="button" onClick={() => setPreview(false)} className="size-9 grid place-items-center rounded-lg bg-secondary/60 border border-border/50 hover:bg-secondary">
              <X className="size-4" />
            </button>
          </div>
          <div className="flex-1 min-h-0 rounded-2xl border border-border/50 bg-background bg-grid p-4 overflow-hidden">
            <BentoGrid mode="tv" className="h-full">
              {layout.map((w, i) => (
                <BentoCell key={w.id} size={w.size}>
                  <WidgetRenderer widget={w} kpis={MOCK_KPIS} index={i} />
                </BentoCell>
              ))}
            </BentoGrid>
          </div>
        </div>
      )}
    </div>
  );
}

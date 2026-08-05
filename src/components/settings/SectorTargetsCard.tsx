"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { LisionCard, LisionCardHeader } from "@/components/ui/lision-card";
import { Button } from "@/components/ui/button";
import { useServerData } from "@/hooks/use-server-data";
import { showToast } from "@/lib/toast";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { normalizeHourlyTargetMode, resolveHourlyTarget, type HourlyTargetMode } from "@/lib/hourly-target-mode";

const UNIT_SUGGESTIONS = ["conjuntos", "peças", "pares", "travetadas", "cortes", "dúzias"];
const MODES: Array<{ value: HourlyTargetMode; label: string }> = [
  { value: "NONE", label: "Sem meta" },
  { value: "AUTO", label: "Automática" },
  { value: "MANUAL", label: "Manual" },
];

interface Stage { id: string; name: string; display_name: string; order_index: number }
interface SectorTarget {
  stage_id: string;
  daily_target: number;
  unit: string | null;
  hourly_target?: number | null;
  hourly_target_mode?: HourlyTargetMode | null;
  shift_start?: string | null;
  shift_end?: string | null;
  lunch_start?: string | null;
  lunch_end?: string | null;
}
interface TenantJourney {
  hourlyMetaEnabled: boolean;
  shiftStart: string;
  shiftEnd: string;
  lunchStart: string;
  lunchEnd: string;
}
interface Draft { target: string; unit: string; hourly: string; mode: HourlyTargetMode }

function toMinutes(value: string | null | undefined): number | null {
  if (!value || !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value)) return null;
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

function usefulHours(target: SectorTarget | undefined, journey: TenantJourney | null): number {
  const start = toMinutes(target?.shift_start) ?? toMinutes(journey?.shiftStart);
  const end = toMinutes(target?.shift_end) ?? toMinutes(journey?.shiftEnd);
  if (start == null || end == null || end <= start) return 0;
  const lunchStart = toMinutes(target?.lunch_start) ?? toMinutes(journey?.lunchStart);
  const lunchEnd = toMinutes(target?.lunch_end) ?? toMinutes(journey?.lunchEnd);
  const lunch = lunchStart != null && lunchEnd != null && lunchEnd > lunchStart ? lunchEnd - lunchStart : 0;
  return Math.max(0, (end - start - lunch) / 60);
}

function SectorTargetsCard() {
  const { data: stages, isLoading } = useServerData<Stage[]>("/api/settings/stages");
  const { data: sectorTargets, refetch } = useServerData<SectorTarget[]>("/api/settings/sector-targets");
  const { data: journey } = useServerData<TenantJourney>("/api/settings/targets");
  const sortedStages = React.useMemo(() => [...(stages || [])].sort((a, b) => a.order_index - b.order_index), [stages]);
  const map = React.useMemo(() => new Map((sectorTargets || []).map((s) => [s.stage_id, s])), [sectorTargets]);
  const [draft, setDraft] = React.useState<Record<string, Draft>>({});
  const [saving, setSaving] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  function initial(stageId: string): Draft {
    const target = map.get(stageId);
    return {
      target: target ? String(target.daily_target) : "",
      unit: target?.unit ?? "",
      hourly: target?.hourly_target != null ? String(target.hourly_target) : "",
      mode: normalizeHourlyTargetMode(target?.hourly_target_mode),
    };
  }
  function val(stageId: string) { return draft[stageId] ?? initial(stageId); }
  function update(stageId: string, patch: Partial<Draft>) {
    setDraft((current) => ({ ...current, [stageId]: { ...(current[stageId] ?? initial(stageId)), ...patch } }));
    setErrors((current) => ({ ...current, [stageId]: "" }));
  }

  async function save(stageId: string) {
    const current = val(stageId);
    if (current.target.trim() === "") return remove(stageId);
    const dailyTarget = Number(current.target);
    if (!Number.isInteger(dailyTarget) || dailyTarget < 0) {
      setErrors((p) => ({ ...p, [stageId]: "Informe uma meta diária inteira e positiva." }));
      return;
    }
    const manualTarget = current.mode === "MANUAL" ? Number(current.hourly) : null;
    if (current.mode === "MANUAL" && (!Number.isInteger(manualTarget) || (manualTarget ?? 0) <= 0)) {
      setErrors((p) => ({ ...p, [stageId]: "A meta/hora manual deve ser um inteiro maior que zero." }));
      return;
    }
    setSaving(stageId);
    try {
      const res = await fetch("/api/settings/sector-targets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage_id: stageId,
          daily_target: dailyTarget,
          unit: current.unit.trim() || null,
          hourly_target_mode: current.mode,
          hourly_target: current.mode === "MANUAL" ? manualTarget : null,
          shift_start: map.get(stageId)?.shift_start ?? null,
          shift_end: map.get(stageId)?.shift_end ?? null,
          lunch_start: map.get(stageId)?.lunch_start ?? null,
          lunch_end: map.get(stageId)?.lunch_end ?? null,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.data) throw new Error(json?.error || "Erro ao salvar");
      const confirmed = json.data as SectorTarget;
      setDraft((p) => ({ ...p, [stageId]: {
        target: String(confirmed.daily_target),
        unit: confirmed.unit ?? "",
        mode: normalizeHourlyTargetMode(confirmed.hourly_target_mode),
        hourly: confirmed.hourly_target != null ? String(confirmed.hourly_target) : "",
      } }));
      refetch();
      showToast("success", "Meta do processo salva e confirmada");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao salvar";
      setErrors((p) => ({ ...p, [stageId]: message }));
      showToast("error", message);
    } finally { setSaving(null); }
  }

  async function remove(stageId: string) {
    setSaving(stageId);
    try {
      const res = await fetch(`/api/settings/sector-targets?stage_id=${stageId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setDraft((p) => { const next = { ...p }; delete next[stageId]; return next; });
      refetch();
      showToast("success", "Meta do processo removida");
    } catch { showToast("error", "Erro ao remover"); }
    finally { setSaving(null); }
  }

  return (
    <LisionCard>
      <LisionCardHeader eyebrow="Produção" title="Meta diária e por hora por processo" />
      <p className="mb-4 text-xs text-muted-foreground/70">
        Escolha a fonte da meta por hora em cada processo. Zero nunca ativa o modo automático.
      </p>
      <datalist id="unit-suggestions">{UNIT_SUGGESTIONS.map((unit) => <option key={unit} value={unit} />)}</datalist>

      {isLoading ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
        : sortedStages.length === 0 ? <div className="py-6 text-center text-sm text-muted-foreground">Nenhum processo cadastrado.</div>
        : <div className="space-y-3">{sortedStages.map((stage) => {
          const current = val(stage.id);
          const stored = map.get(stage.id);
          const hours = usefulHours(stored, journey);
          const auto = resolveHourlyTarget({ mode: "AUTO", manualTarget: null, baseDailyTarget: Number(current.target), usefulHours: hours, globalFeatureEnabled: true });
          return (
            <section key={stage.id} className="rounded-xl border border-border/60 bg-secondary/20 p-4" aria-labelledby={`sector-${stage.id}`}>
              <div className="grid gap-3 lg:grid-cols-[minmax(160px,1fr)_110px_140px_auto] lg:items-end">
                <div><p id={`sector-${stage.id}`} className="mb-1.5 text-sm font-medium">{stage.display_name}</p>
                  <RadioGroup value={current.mode} onValueChange={(value) => update(stage.id, { mode: value as HourlyTargetMode, ...(value === "MANUAL" ? {} : { hourly: "" }) })}
                    aria-label={`Fonte da meta por hora de ${stage.display_name}`} className="inline-flex flex-wrap gap-1 rounded-lg border border-border/70 p-1">
                    {MODES.map((mode) => <label key={mode.value} htmlFor={`${stage.id}-${mode.value}`}
                      className={cn("flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition", current.mode === mode.value ? "bg-foreground text-background" : "text-muted-foreground hover:bg-secondary")}>
                      <RadioGroupItem id={`${stage.id}-${mode.value}`} value={mode.value} className={cn("size-3 border-current", current.mode === mode.value && "text-background")} />
                      {mode.label}
                    </label>)}
                  </RadioGroup>
                </div>
                <label className="text-xs text-muted-foreground">Meta/dia
                  <input type="number" min={0} className="input-field mt-1 tabular-nums" value={current.target} onChange={(e) => update(stage.id, { target: e.target.value })} />
                </label>
                <label className="text-xs text-muted-foreground">Unidade
                  <input className="input-field mt-1" list="unit-suggestions" value={current.unit} onChange={(e) => update(stage.id, { unit: e.target.value })} />
                </label>
                <div className="flex gap-1">
                  <Button onClick={() => save(stage.id)} disabled={saving === stage.id} className="h-9">{saving === stage.id ? "..." : "Salvar"}</Button>
                  {map.has(stage.id) && <button type="button" onClick={() => remove(stage.id)} disabled={saving === stage.id} className="h-9 rounded-md border border-border/60 px-2 text-muted-foreground hover:text-destructive" title="Remover meta deste processo"><Trash2 className="size-4" /></button>}
                </div>
              </div>
              <div className="mt-3">
                {current.mode === "NONE" && <p className="text-xs text-muted-foreground">Sem cálculo por hora. A TV usará a meta do dia.</p>}
                {current.mode === "AUTO" && <p className="text-xs text-muted-foreground">{auto.target != null ? `Prévia: ${current.target || 0} ÷ ${hours.toLocaleString("pt-BR")}h = ${auto.target} por hora.` : "Configure uma meta diária e uma jornada útil válidas para calcular a prévia."}{journey?.hourlyMetaEnabled === false ? " O recurso global está desligado; a TV continuará no Dia." : ""}</p>}
                {current.mode === "MANUAL" && <label className="block max-w-[220px] text-xs text-muted-foreground">Meta/hora manual
                  <input type="number" min={1} step={1} required aria-invalid={Boolean(errors[stage.id])} className="input-field mt-1 tabular-nums" placeholder="Ex.: 300" value={current.hourly} onChange={(e) => update(stage.id, { hourly: e.target.value })} />
                </label>}
                {errors[stage.id] && <p role="alert" className="mt-2 text-xs text-destructive">{errors[stage.id]}</p>}
              </div>
            </section>
          );
        })}</div>}
    </LisionCard>
  );
}

export { SectorTargetsCard };

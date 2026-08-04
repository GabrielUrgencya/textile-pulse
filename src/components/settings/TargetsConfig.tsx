"use client";

import * as React from "react";
import { LisionCard, LisionCardHeader } from "@/components/ui/lision-card";
import { Button } from "@/components/ui/button";
import { useServerData } from "@/hooks/use-server-data";
import { showToast } from "@/lib/toast";
import { Skeleton } from "@/components/ui/skeleton";
import { SectorTargetsCard } from "./SectorTargetsCard";
import { SectorResetCard } from "./SectorResetCard";
import { confirmsTargetTimeSave } from "@/lib/target-settings-confirmation";
import { type TargetTimeField, withTargetTimeValue } from "@/lib/target-time-input";

interface Targets {
  dailyPiecesTarget: number;
  weeklyPointsTarget: number;
  monthlyPointsTarget: number;
  productivityTarget: number;
  defectTolerance: number;
  shiftStart: string;
  shiftEnd: string;
  hourlyMetaEnabled: boolean;
  lunchStart: string;
  lunchEnd: string;
}

/** Horas úteis = (fim − início − almoço), em horas com 1 casa. null = jornada inválida. */
function workingHours(start: string, end: string, lunchStart: string, lunchEnd: string): number | null {
  const min = (v: string) => (/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(v) ? Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5)) : null);
  const s = min(start), e = min(end);
  if (s == null || e == null || e <= s) return null;
  const ls = min(lunchStart), le = min(lunchEnd);
  const lunch = ls != null && le != null && le > ls ? le - ls : 0;
  const h = (e - s - lunch) / 60;
  return h > 0 ? Math.round(h * 10) / 10 : null;
}

function TargetsConfig() {
  const { data, isLoading, refetch } = useServerData<Targets>("/api/settings/targets");
  const [form, setForm] = React.useState<Targets>({
    dailyPiecesTarget: 1000,
    weeklyPointsTarget: 5000,
    monthlyPointsTarget: 20000,
    productivityTarget: 85,
    defectTolerance: 3,
    shiftStart: "07:00",
    shiftEnd: "17:00",
    hourlyMetaEnabled: false,
    lunchStart: "",
    lunchEnd: "",
  });
  const [saving, setSaving] = React.useState(false);
  const uteis = workingHours(form.shiftStart, form.shiftEnd, form.lunchStart, form.lunchEnd);

  React.useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const update = (key: keyof Targets, value: string | number | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleTimeInput = (field: TargetTimeField) => (event: React.FormEvent<HTMLInputElement>) => {
    const value = event.currentTarget.value;
    setForm((prev) => withTargetTimeValue(prev, field, value));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/targets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !confirmsTargetTimeSave(payload?.data?.settings, form)) {
        throw new Error();
      }
      await refetch();
      showToast("success", "Metas atualizadas");
    } catch {
      showToast("error", "Erro ao salvar metas");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <LisionCard>
        <Skeleton className="h-6 w-32 mb-6" />
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </LisionCard>
    );
  }

  return (
    <div className="space-y-6">
    <LisionCard>
      <LisionCardHeader eyebrow="Dashboard" title="Meta geral" />

      <div className="space-y-4">
        {/* Story 8.30: metas independentes por período (pontos/peças) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">
              Meta diária
            </label>
            <input
              type="number"
              className="input-field"
              value={form.dailyPiecesTarget}
              onChange={(e) => update("dailyPiecesTarget", Number(e.target.value))}
              min={0}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">
              Meta semanal
            </label>
            <input
              type="number"
              className="input-field"
              value={form.weeklyPointsTarget}
              onChange={(e) => update("weeklyPointsTarget", Number(e.target.value))}
              min={0}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">
              Meta mensal
            </label>
            <input
              type="number"
              className="input-field"
              value={form.monthlyPointsTarget}
              onChange={(e) => update("monthlyPointsTarget", Number(e.target.value))}
              min={0}
            />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground/60 -mt-2">
          Valores independentes (a semanal e a mensal não são múltiplos da diária). Usadas no toggle Hoje/Semana/Mês do dashboard.
        </p>

        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">
            Meta de produtividade (%)
          </label>
          <input
            type="number"
            className="input-field"
            value={form.productivityTarget}
            onChange={(e) => update("productivityTarget", Number(e.target.value))}
            min={0}
            max={100}
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">
            Tolerância de defeitos (%)
          </label>
          <input
            type="number"
            className="input-field"
            value={form.defectTolerance}
            onChange={(e) => update("defectTolerance", Number(e.target.value))}
            min={0}
            max={100}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">
              Início do turno
            </label>
            <input
              type="time"
              className="input-field"
              value={form.shiftStart}
              onInput={handleTimeInput("shiftStart")}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">
              Fim do turno
            </label>
            <input
              type="time"
              className="input-field"
              value={form.shiftEnd}
              onInput={handleTimeInput("shiftEnd")}
            />
          </div>
        </div>

        {/* Frente 3 — Jornada / meta por hora (compartilhada por tenant) */}
        <div className="rounded-lg border border-border/60 p-4 space-y-4">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              className="size-4 accent-foreground"
              checked={form.hourlyMetaEnabled}
              onChange={(e) => update("hourlyMetaEnabled", e.target.checked)}
            />
            <span className="text-sm font-medium">Ativar meta por hora na TV</span>
          </label>
          <p className="text-[11px] text-muted-foreground/60 -mt-2">
            O herói da TV passa a ser o anel da meta da hora (produção da hora vs meta). Sem ativar, a TV mantém o herói do dia.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Início do almoço</label>
              <input type="time" className="input-field" value={form.lunchStart} onInput={handleTimeInput("lunchStart")} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Fim do almoço</label>
              <input type="time" className="input-field" value={form.lunchEnd} onInput={handleTimeInput("lunchEnd")} />
            </div>
          </div>
          <p className="text-sm">
            Horas úteis:{" "}
            <span className="font-semibold tabular-nums">{uteis != null ? `${uteis} h` : "— (jornada inválida)"}</span>
            <span className="text-muted-foreground/60"> — a meta da hora deriva da meta base do setor ÷ horas úteis.</span>
          </p>
        </div>

        <p className="text-xs text-muted-foreground/60">
          Estas metas serão usadas no dashboard e no kiosk TV.
        </p>

        <Button onClick={handleSave} disabled={saving} className="mt-2">
          {saving ? "Salvando..." : "Salvar Metas"}
        </Button>
      </div>
    </LisionCard>

    {/* Story 8.23: meta por processo na mesma aba "Metas" */}
    <SectorTargetsCard />

    {/* Frente 1: zerar meta do setor (progresso/dívida × hora/dia/semana/mês) */}
    <SectorResetCard />
    </div>
  );
}

export { TargetsConfig };

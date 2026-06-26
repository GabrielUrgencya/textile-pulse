"use client";

import * as React from "react";
import { LisionCard, LisionCardHeader } from "@/components/ui/lision-card";
import { Button } from "@/components/ui/button";
import { useServerData } from "@/hooks/use-server-data";
import { showToast } from "@/lib/toast";
import { Skeleton } from "@/components/ui/skeleton";
import { SectorTargetsCard } from "./SectorTargetsCard";

interface Targets {
  dailyPiecesTarget: number;
  weeklyPointsTarget: number;
  monthlyPointsTarget: number;
  productivityTarget: number;
  defectTolerance: number;
  shiftStart: string;
  shiftEnd: string;
}

function TargetsConfig() {
  const { data, isLoading } = useServerData<Targets>("/api/settings/targets");
  const [form, setForm] = React.useState<Targets>({
    dailyPiecesTarget: 1000,
    weeklyPointsTarget: 5000,
    monthlyPointsTarget: 20000,
    productivityTarget: 85,
    defectTolerance: 3,
    shiftStart: "07:00",
    shiftEnd: "17:00",
  });
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const update = (key: keyof Targets, value: string | number) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/targets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
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
              onChange={(e) => update("shiftStart", e.target.value)}
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
              onChange={(e) => update("shiftEnd", e.target.value)}
            />
          </div>
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
    </div>
  );
}

export { TargetsConfig };

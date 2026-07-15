"use client";

import * as React from "react";
import { LisionCard, LisionCardHeader } from "@/components/ui/lision-card";
import { Button } from "@/components/ui/button";
import { useServerData } from "@/hooks/use-server-data";
import { showToast } from "@/lib/toast";
import { Skeleton } from "@/components/ui/skeleton";

interface TenantData {
  id: string;
  name: string;
  settings: { timezone?: string; work_days?: number[] } | null;
}

const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
];
const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5];

const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Belem",
  "America/Fortaleza",
  "America/Recife",
  "America/Cuiaba",
  "America/Porto_Velho",
  "America/Rio_Branco",
];

function TenantSettings() {
  const { data, isLoading } = useServerData<TenantData>("/api/settings/tenant");
  const [name, setName] = React.useState("");
  const [timezone, setTimezone] = React.useState("America/Sao_Paulo");
  const [workDays, setWorkDays] = React.useState<number[]>(DEFAULT_WORK_DAYS);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (data) {
      setName(data.name || "");
      setTimezone(data.settings?.timezone || "America/Sao_Paulo");
      const wd = data.settings?.work_days;
      setWorkDays(Array.isArray(wd) && wd.length > 0 ? wd : DEFAULT_WORK_DAYS);
    }
  }, [data]);

  const toggleDay = (d: number) => {
    setWorkDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)));
  };

  const handleSave = async () => {
    if (workDays.length === 0) {
      showToast("error", "Selecione ao menos um dia de trabalho");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings/tenant", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, timezone, work_days: workDays }),
      });
      if (!res.ok) throw new Error();
      showToast("success", "Empresa atualizada");
    } catch {
      showToast("error", "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <LisionCard>
        <Skeleton className="h-6 w-32 mb-6" />
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </LisionCard>
    );
  }

  return (
    <LisionCard>
      <LisionCardHeader eyebrow="Organização" title="Empresa" />

      <div className="space-y-4">
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">Nome da empresa</label>
          <input
            className="input-field"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">Fuso horário</label>
          <select
            className="input-field"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">Dias de trabalho</label>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((d) => {
              const active = workDays.includes(d.value);
              return (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => toggleDay(d.value)}
                  aria-pressed={active}
                  className={
                    "h-9 w-12 rounded-lg text-[13px] font-medium border transition-colors " +
                    (active
                      ? "bg-foreground text-background border-foreground"
                      : "bg-secondary/40 text-muted-foreground border-border hover:bg-secondary")
                  }
                >
                  {d.label}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground/70 mt-1.5">
            A meta só acumula/cobra nos dias marcados. Fim de semana desmarcado não gera dívida.
          </p>
        </div>

        <Button onClick={handleSave} disabled={saving} className="mt-2">
          {saving ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </LisionCard>
  );
}

export { TenantSettings };

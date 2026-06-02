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
  settings: { timezone?: string } | null;
}

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
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (data) {
      setName(data.name || "");
      setTimezone(data.settings?.timezone || "America/Sao_Paulo");
    }
  }, [data]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/tenant", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, timezone }),
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

        <Button onClick={handleSave} disabled={saving} className="mt-2">
          {saving ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </LisionCard>
  );
}

export { TenantSettings };

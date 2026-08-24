"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { salesAdminConfigurationRequest } from "@/components/sales/admin/SalesAdminConfiguration";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { SalesAdminDirectoryEntry } from "@/lib/sales-admin";
import type { SalesAdminConfiguration } from "@/lib/sales-admin-configuration";

export function SalesAdminAssignments() {
  const [data, setData] = useState<SalesAdminConfiguration | null>(null);
  const [people, setPeople] = useState<SalesAdminDirectoryEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [goalId, setGoal] = useState("");
  const [periodId, setPeriod] = useState("");
  const [profileId, setProfile] = useState("");
  const [active, setActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const saveErrorRef = useRef<HTMLDivElement>(null);
  const savingRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [configuration, directory] = await Promise.all([
        salesAdminConfigurationRequest<SalesAdminConfiguration>("/api/vendas/admin/configuration"),
        salesAdminConfigurationRequest<SalesAdminDirectoryEntry[]>("/api/vendas/admin/directory"),
      ]);
      setData(configuration);
      setPeople(directory);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "Atribuições indisponíveis.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const goals = data?.goals.filter((goal) => goal.isActive) ?? [];
  const periods = data?.periods.filter((period) => period.status === "OPEN") ?? [];
  const goal = goals.find((item) => item.id === goalId);
  const consultants = people.filter(
    (person) => person.salesRole === "CONSULTANT" && person.membershipIsActive,
  );

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;

    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      await salesAdminConfigurationRequest("/api/vendas/admin/goal-assignments", {
        method: "PUT",
        body: JSON.stringify({
          assignmentId: null,
          goalId,
          periodId,
          profileId: goal?.scope === "COLLECTIVE" ? null : profileId,
          isActive: active,
          expectedRevision: 0,
        }),
      });
      setAnnouncement("Atribuição salva e fonte canônica revalidada.");
      setOpen(false);
      await load();
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : "Falha ao salvar a atribuição.");
      requestAnimationFrame(() => saveErrorRef.current?.focus());
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="assignment-editor-title" className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 id="assignment-editor-title" className="text-xl font-semibold">Gerenciar atribuições</h2>
          <p className="text-sm text-muted-foreground">
            Metas individuais aceitam somente consultoras ativas; coletivas abrangem a equipe.
          </p>
        </div>
        <Button className="min-h-11" disabled={loading || !data} onClick={() => setOpen(!open)}>
          {open ? "Cancelar" : "Nova atribuição"}
        </Button>
      </div>

      <div aria-live="polite" className="sr-only">{announcement}</div>

      {loadError && (
        <div role="alert" className="rounded-lg border border-destructive/30 p-3 text-destructive">
          {loadError}{" "}
          <Button variant="link" onClick={() => void load()}>Tentar novamente</Button>
        </div>
      )}

      {loading && !data && (
        <Card>
          <CardContent className="p-5 text-muted-foreground">Carregando atribuições...</CardContent>
        </Card>
      )}

      {open && data && (
        <Card>
          <CardContent className="p-5">
            <form className="grid gap-4 md:grid-cols-2" onSubmit={(event) => void save(event)}>
              {saveError && (
                <div
                  ref={saveErrorRef}
                  tabIndex={-1}
                  role="alert"
                  className="rounded border border-destructive/30 p-3 text-destructive md:col-span-2"
                >
                  {saveError}
                </div>
              )}
              <Field id="assignment-goal" label="Meta">
                <select id="assignment-goal" className="min-h-11 w-full rounded-md border bg-background px-3" value={goalId} onChange={(event) => { setGoal(event.target.value); setProfile(""); }}>
                  <option value="">Selecione</option>
                  {goals.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </Field>
              <Field id="assignment-period" label="Período aberto">
                <select id="assignment-period" className="min-h-11 w-full rounded-md border bg-background px-3" value={periodId} onChange={(event) => setPeriod(event.target.value)}>
                  <option value="">Selecione</option>
                  {periods.map((item) => <option key={item.id} value={item.id}>{item.startsOn} a {item.endsOn}</option>)}
                </select>
              </Field>
              {goal?.scope !== "COLLECTIVE" && (
                <Field id="assignment-person" label="Consultora elegível">
                  <select id="assignment-person" className="min-h-11 w-full rounded-md border bg-background px-3" value={profileId} onChange={(event) => setProfile(event.target.value)}>
                    <option value="">Selecione</option>
                    {consultants.map((person) => <option key={person.profileId} value={person.profileId}>{person.fullName ?? person.email}</option>)}
                  </select>
                </Field>
              )}
              <div className="flex min-h-11 items-center gap-3">
                <Switch id="assignment-active" checked={active} onCheckedChange={setActive} />
                <Label htmlFor="assignment-active">Atribuição ativa</Label>
              </div>
              <Button type="submit" className="min-h-11 md:col-span-2 md:w-fit" disabled={saving || !goalId || !periodId || (goal?.scope !== "COLLECTIVE" && !profileId)}>
                {saving ? "Salvando..." : "Salvar atribuição"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label>{children}</div>;
}

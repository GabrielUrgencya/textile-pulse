"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Switch } from "@/components/ui/switch";
import type { SalesAdminConfiguration } from "@/lib/sales-admin-configuration";

type ApiError = { error?: { message?: string } };
export async function salesAdminConfigurationRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const payload = (await response.json()) as { data?: T } & ApiError;
  if (!response.ok || payload.data === undefined) throw new Error(payload.error?.message || "Não foi possível concluir a operação.");
  return payload.data;
}

export function SalesAdminConfiguration() {
  const [data, setData] = useState<SalesAdminConfiguration | null>(null);
  const [error, setError] = useState<string | null>(null); const [saving, setSaving] = useState(false); const [announcement, setAnnouncement] = useState("");
  const [pieces, setPieces] = useState(1); const [timezone, setTimezone] = useState("America/Sao_Paulo"); const [week, setWeek] = useState(1); const [aggregates, setAggregates] = useState(true); const errorRef = useRef<HTMLDivElement>(null);
  const [autoOpen, setAutoOpen] = useState(true); const [autoSaving, setAutoSaving] = useState(false);
  const load = useCallback(async () => { setError(null); try { const value = await salesAdminConfigurationRequest<SalesAdminConfiguration>("/api/vendas/admin/configuration"); setData(value); setPieces(value.config?.piecesPerSet ?? 1); setTimezone(value.config?.timezone ?? "America/Sao_Paulo"); setWeek(value.config?.weekStartsOn ?? 1); setAggregates(value.config?.allowTeamAggregates ?? true); setAutoOpen(value.config?.autoOpenPeriod ?? true); } catch (cause) { setError(cause instanceof Error ? cause.message : "Configuração indisponível."); } }, []);
  async function toggleAutoOpen(next: boolean) { setAutoSaving(true); setError(null); const prev = autoOpen; setAutoOpen(next); try { await salesAdminConfigurationRequest("/api/vendas/admin/auto-open-period", { method: "PUT", body: JSON.stringify({ enabled: next }) }); setAnnouncement(next ? "Abertura automática de período ligada." : "Abertura automática desligada."); } catch (cause) { setAutoOpen(prev); setError(cause instanceof Error ? cause.message : "Falha ao salvar."); } finally { setAutoSaving(false); } }
  useEffect(() => void load(), [load]);
  async function save(event: React.FormEvent) { event.preventDefault(); setSaving(true); setError(null); try { await salesAdminConfigurationRequest("/api/vendas/admin/configuration", { method: "PUT", body: JSON.stringify({ piecesPerSet: pieces, timezone, weekStartsOn: week, allowTeamAggregates: aggregates, expectedRevision: data?.config?.revision ?? 0 }) }); setAnnouncement("Configurações salvas."); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao salvar."); requestAnimationFrame(() => errorRef.current?.focus()); } finally { setSaving(false); } }
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="LISION Vendas" title="Configurações comerciais" description="Regras prospectivas do tenant. O histórico encerrado não é reescrito." />
      <div aria-live="polite" className="sr-only">{announcement}</div>
      {error && <div ref={errorRef} tabIndex={-1} role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error} <Button variant="link" onClick={() => void load()}>Tentar novamente</Button></div>}
      <Card>
        <CardContent className="p-6">
          <form className="grid gap-5 md:grid-cols-2" onSubmit={(event) => void save(event)}>
            <div className="space-y-1.5">
              <Label htmlFor="pieces">Peças por conjunto</Label>
              <Input id="pieces" type="number" min={1} max={1000} value={pieces} onChange={(e) => setPieces(Number(e.target.value))} disabled={saving || !data} className="min-h-11" />
              <p className="text-[11px] text-muted-foreground">Multiplica as peças em cada venda com conjuntos (ex.: 1 conjunto = {pieces || 1} peça{(pieces || 1) > 1 ? "s" : ""}).</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="timezone">Fuso horário</Label>
              <Input id="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} disabled={saving || !data} className="min-h-11" />
              <p className="text-[11px] text-muted-foreground">Usado para datar vendas e calcular dias úteis.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="week">Início da semana</Label>
              <select id="week" value={week} onChange={(e) => setWeek(Number(e.target.value))} disabled={saving || !data} className="input-field min-h-11">
                {WEEKDAY_NAMES.map((name, index) => <option key={index} value={index}>{name}</option>)}
              </select>
              <p className="text-[11px] text-muted-foreground">Primeiro dia das semanas nos cálculos de ritmo.</p>
            </div>
            <div className="space-y-1.5">
              <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border/60 p-3">
                <Label htmlFor="aggregates">Agregados da equipe</Label>
                <Switch id="aggregates" checked={aggregates} onCheckedChange={setAggregates} disabled={saving || !data} />
              </div>
              <p className="text-[11px] text-muted-foreground">Liga os rankings e indicadores coletivos do painel (respeitando os mínimos de privacidade).</p>
            </div>
            <Button type="submit" disabled={saving || !data} className="min-h-11 md:col-span-2 md:w-fit">{saving ? "Salvando..." : "Salvar configurações"}</Button>
          </form>
          <div className="mt-6 border-t border-border/60 pt-5">
            <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border/60 p-3">
              <div><Label htmlFor="auto-open">Abertura automática de período</Label><p className="mt-0.5 text-[11px] text-muted-foreground">Se não houver período aberto, o sistema abre o do mês corrente automaticamente. O fechamento continua manual (deliberado). Salva na hora.</p></div>
              <Switch id="auto-open" checked={autoOpen} onCheckedChange={(v) => void toggleAutoOpen(v)} disabled={autoSaving || !data} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const WEEKDAY_NAMES = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

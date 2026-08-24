"use client";

import * as React from "react";
import { LisionCard, LisionCardHeader } from "@/components/ui/lision-card";
import { Button } from "@/components/ui/button";
import { salesAdminConfigurationRequest } from "@/components/sales/admin/SalesAdminConfiguration";
import type { SalesGoalRecord } from "@/lib/sales-admin-configuration";

/**
 * Metas e comissões — mesmo mecanismo/UI do Lision (SectorTargetsCard): edição
 * INLINE por linha dentro de um LisionCard, com "Salvar" por meta. Recicla o
 * padrão de criação de metas do produto principal para o LISION Vendas.
 * Persiste em /api/vendas/admin/goals (mesmo contrato), preservando escopo,
 * identidade, ordem e vigência da meta — o usuário edita valor/comissão/nome.
 */

type Draft = { name: string; target: string; commission: string };

export function SalesGoalsCard({
  goals,
  reload,
  announce,
}: {
  goals: SalesGoalRecord[];
  reload: () => Promise<void>;
  announce: (value: string) => void;
}) {
  const sorted = React.useMemo(() => [...goals].sort((a, b) => a.sortOrder - b.sortOrder), [goals]);
  const [draft, setDraft] = React.useState<Record<string, Draft>>({});
  const [saving, setSaving] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  function val(goal: SalesGoalRecord): Draft {
    return draft[goal.id] ?? { name: goal.name, target: String(goal.targetValue), commission: String(goal.commissionPercent) };
  }
  function set(goal: SalesGoalRecord, key: keyof Draft, value: string) {
    setDraft((p) => ({ ...p, [goal.id]: { ...val(goal), [key]: value } }));
  }

  async function save(goal: SalesGoalRecord) {
    const v = val(goal);
    const target = Number(v.target);
    const commission = Number(v.commission);
    if (!v.name.trim()) { setError("Informe o nome da meta."); return; }
    if (!Number.isFinite(target) || target < 0) { setError("Valor da meta inválido."); return; }
    if (!Number.isFinite(commission) || commission < 0 || commission > 100) { setError("Comissão deve ficar entre 0 e 100."); return; }
    setSaving(goal.id); setError(null);
    try {
      await salesAdminConfigurationRequest("/api/vendas/admin/goals", {
        method: "PUT",
        body: JSON.stringify({
          goalId: goal.id,
          provisioningKey: goal.provisioningKey,
          name: v.name.trim(),
          scope: goal.scope,
          targetValue: target,
          commissionPercent: commission,
          sortOrder: goal.sortOrder,
          isChallenge: goal.isChallenge,
          isActive: goal.isActive,
          validFrom: goal.validFrom,
          validUntil: goal.validUntil,
          expectedRevision: goal.revision,
        }),
      });
      announce(`Meta "${v.name.trim()}" salva.`);
      setDraft((p) => { const n = { ...p }; delete n[goal.id]; return n; });
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao salvar a meta.");
    } finally {
      setSaving(null);
    }
  }

  const dirty = sorted.filter((g) => { const d = draft[g.id]; return d && (d.name !== g.name || d.target !== String(g.targetValue) || d.commission !== String(g.commissionPercent)); });

  async function saveAll() {
    if (!dirty.length) return;
    setSaving("__all__"); setError(null);
    try {
      for (const goal of dirty) {
        const v = val(goal); const target = Number(v.target); const commission = Number(v.commission);
        if (!v.name.trim()) throw new Error(`Informe o nome da meta "${goal.name}".`);
        if (!Number.isFinite(target) || target < 0) throw new Error(`Valor inválido na meta "${goal.name}".`);
        if (!Number.isFinite(commission) || commission < 0 || commission > 100) throw new Error(`Comissão inválida na meta "${goal.name}".`);
        await salesAdminConfigurationRequest("/api/vendas/admin/goals", { method: "PUT", body: JSON.stringify({ goalId: goal.id, provisioningKey: goal.provisioningKey, name: v.name.trim(), scope: goal.scope, targetValue: target, commissionPercent: commission, sortOrder: goal.sortOrder, isChallenge: goal.isChallenge, isActive: goal.isActive, validFrom: goal.validFrom, validUntil: goal.validUntil, expectedRevision: goal.revision }) });
      }
      announce(`${dirty.length} meta(s) salva(s).`);
      setDraft({});
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao salvar as metas.");
      setDraft({}); await reload();
    } finally { setSaving(null); }
  }

  return (
    <LisionCard>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <LisionCardHeader eyebrow="Comercial" title="Metas e comissões" />
        {dirty.length > 0 && (
          <Button onClick={() => void saveAll()} disabled={saving !== null} className="h-9 shrink-0">
            {saving === "__all__" ? "Salvando..." : `Salvar todas (${dirty.length})`}
          </Button>
        )}
      </div>
      <p className="mb-1 text-xs text-muted-foreground/70">
        Ajuste o valor e a comissão de cada meta direto na linha e salve — mesmo jeito das metas por processo do Lision.
      </p>
      <p className="mb-4 text-[11px] text-muted-foreground/50">
        Identidade, escopo e vigência de cada meta são preservados. Valores e comissões vigentes alimentam a fonte canônica.
      </p>

      {error && <div role="alert" className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      {sorted.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">Nenhuma meta configurada.</div>
      ) : (
        <>
          <div className="mb-1.5 grid grid-cols-[1fr_130px_110px_auto] gap-2 px-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>Meta</span>
            <span>Valor (R$)</span>
            <span>Comissão (%)</span>
            <span></span>
          </div>
          <div className="space-y-2">
            {sorted.map((goal) => {
              const v = val(goal);
              return (
                <div key={goal.id} className="grid grid-cols-[1fr_130px_110px_auto] items-center gap-2">
                  <div className="min-w-0">
                    <input
                      className="input-field w-full"
                      value={v.name}
                      onChange={(e) => set(goal, "name", e.target.value)}
                    />
                    <span className="mt-0.5 block text-[10px] uppercase tracking-wider text-muted-foreground/60">
                      {goal.provisioningKey ?? "Pontual"} · {goal.scope === "COLLECTIVE" ? "Coletiva" : "Individual"}{goal.isChallenge ? " · Desafio" : ""}
                    </span>
                  </div>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="input-field tabular-nums"
                    value={v.target}
                    onChange={(e) => set(goal, "target", e.target.value)}
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.0001"
                    className="input-field tabular-nums"
                    value={v.commission}
                    onChange={(e) => set(goal, "commission", e.target.value)}
                  />
                  <Button onClick={() => void save(goal)} disabled={saving !== null} className="h-9">
                    {saving === goal.id ? "..." : "Salvar"}
                  </Button>
                </div>
              );
            })}
          </div>
          {sorted.some((g) => g.commissionPercent === 0) && (
            <p className="mt-3 text-[11px] text-muted-foreground/60">
              Metas com comissão 0% (coletiva/trimestral) não pagam comissão individual — servem de acompanhamento.
            </p>
          )}
        </>
      )}
    </LisionCard>
  );
}

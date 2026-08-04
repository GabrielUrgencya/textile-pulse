"use client";

import * as React from "react";
import { RotateCcw, Eraser } from "lucide-react";
import { LisionCard, LisionCardHeader } from "@/components/ui/lision-card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useServerData } from "@/hooks/use-server-data";
import { showToast } from "@/lib/toast";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Frente 1 — Zerar meta do setor (admin).
 * Por SETOR e por PERÍODO, zera o PROGRESSO (produção do período some das
 * métricas — não apaga bipagem) ou a DÍVIDA (goal_deficits volta à base).
 * Ações distintas e independentes. Endpoint: POST /api/settings/sector-targets/reset.
 */

interface Stage { id: string; display_name: string; order_index: number }
type Period = "hour" | "day" | "week" | "month";
type Target = "progress" | "debt";

const PERIODS: { id: Period; label: string }[] = [
  { id: "hour", label: "Hora" },
  { id: "day", label: "Dia" },
  { id: "week", label: "Semana" },
  { id: "month", label: "Mês" },
];

function SectorResetCard() {
  const { data: stages, isLoading } = useServerData<Stage[]>("/api/settings/stages");
  const sorted = React.useMemo(
    () => [...(stages || [])].sort((a, b) => a.order_index - b.order_index),
    [stages],
  );

  const [stageId, setStageId] = React.useState("");
  const [period, setPeriod] = React.useState<Period>("day");
  const [pending, setPending] = React.useState<Target | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!stageId && sorted.length > 0) setStageId(sorted[0].id);
  }, [sorted, stageId]);

  const stageName = sorted.find((s) => s.id === stageId)?.display_name ?? "";
  const periodLabel = PERIODS.find((p) => p.id === period)?.label ?? "";
  // A meta por hora é motivacional: zera a cada virada e não acumula dívida.
  const debtDisabledReason = period === "hour" ? "A meta por hora não acumula dívida (é motivacional)." : null;

  async function confirm() {
    if (!pending || !stageId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/sector-targets/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage_id: stageId, period, target: pending }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Falha ao zerar");
      if (pending === "progress") {
        showToast("success", `Progresso zerado — ${payload.data?.scans_disregarded ?? 0} bipagem(ns) desconsiderada(s).`);
      } else {
        showToast("success", `Dívida zerada — ${payload.data?.cleared_deficit ?? 0} perdoada(s).`);
      }
      setPending(null);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Erro ao zerar");
    } finally {
      setSaving(false);
    }
  }

  const consequences =
    pending === "progress"
      ? [
          `A produção do setor no período (${periodLabel.toLowerCase()}) some das métricas, meta, ranking e TV.`,
          "As bipagens não são apagadas — permanecem no histórico do lote (rastreabilidade preservada).",
          "A dívida acumulada NÃO é afetada.",
        ]
      : [
          `A dívida acumulada do setor no período (${periodLabel.toLowerCase()}) volta a zero — a meta efetiva retorna à base.`,
          "A produção já registrada NÃO é afetada.",
          "Ação registrada em auditoria.",
        ];

  return (
    <LisionCard>
      <LisionCardHeader eyebrow="Produção" title="Zerar meta do setor" />
      <p className="text-xs text-muted-foreground/70 mb-1">
        Recomeço limpo por setor. <strong>Progresso</strong> e <strong>dívida</strong> são ações distintas — escolha o período e o que zerar.
      </p>
      <p className="text-[11px] text-muted-foreground/50 mb-4">
        Apenas administradores. Toda zeração é auditada. Zerar progresso não apaga bipagem (preserva o histórico do lote).
      </p>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-6 text-sm text-muted-foreground">Nenhum processo cadastrado.</div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Setor</label>
              <select className="input-field" value={stageId} onChange={(e) => setStageId(e.target.value)}>
                {sorted.map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Período</label>
              <div className="grid grid-cols-4 gap-1.5">
                {PERIODS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPeriod(p.id)}
                    className={
                      "h-9 rounded-md border text-[13px] transition " +
                      (period === p.id
                        ? "border-foreground/70 bg-secondary/70 font-medium"
                        : "border-border/60 text-muted-foreground hover:bg-secondary/40")
                    }
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <Button
              variant="outline"
              className="flex-1 h-10 gap-2"
              disabled={!stageId}
              onClick={() => setPending("progress")}
            >
              <Eraser className="size-4" /> Zerar progresso
            </Button>
            <Button
              variant="outline"
              className="flex-1 h-10 gap-2"
              disabled={!stageId || !!debtDisabledReason}
              title={debtDisabledReason ?? undefined}
              onClick={() => setPending("debt")}
            >
              <RotateCcw className="size-4" /> Zerar dívida
            </Button>
          </div>
          {debtDisabledReason && (
            <p className="text-[11px] text-muted-foreground/60 -mt-1">{debtDisabledReason}</p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!pending}
        onConfirm={confirm}
        onCancel={() => setPending(null)}
        title={`Zerar ${pending === "debt" ? "dívida" : "progresso"} — ${stageName} · ${periodLabel}?`}
        description={`Confirme a zeração de ${pending === "debt" ? "dívida" : "progresso"} do setor "${stageName}" no período "${periodLabel.toLowerCase()}".`}
        consequences={consequences}
        confirmLabel={pending === "debt" ? "Zerar dívida" : "Zerar progresso"}
        variant="warning"
        loading={saving}
      />
    </LisionCard>
  );
}

export { SectorResetCard };

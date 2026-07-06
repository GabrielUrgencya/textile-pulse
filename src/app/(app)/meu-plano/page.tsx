"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { showToast } from "@/lib/toast";
import { displayUnit } from "@/lib/utils";
import {
  MetaDailyCard,
  PercentCard,
  PeriodGoalCard,
  PlanCard,
  HistoryCard,
  MeuPlanoSkeleton,
  type MetaData,
  type Plan,
  type HistoryPoint,
} from "@/components/meu-plano/sections";

/**
 * Módulo "Meu Plano" — bento grid 12 colunas (redesign @ux):
 * [ Meta diária (8) ][ % (4) ] / [ Semana (6) ][ Mês (6) ] /
 * [ Plano (12) ] / [ Histórico (12) ]. Lógica de dados intocada.
 */

interface MyPlanData {
  meta: MetaData | null;
  plans: Plan[];
  producedByDay: Record<string, number>;
  history: HistoryPoint[];
  profile: { id: string; full_name: string | null; sector: string | null } | null;
  today: string;
  isAdmin: boolean;
}

export default function MeuPlanoPage() {
  const { can } = usePermissions();
  const isAdmin = can("settings:manage");

  const [data, setData] = useState<MyPlanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [planView, setPlanView] = useState<"today" | "week" | "month">("today");
  const [histDays, setHistDays] = useState<7 | 30>(7);
  // Zeração manual de meta (admin): período pendente de confirmação
  const [resetTarget, setResetTarget] = useState<"daily" | "weekly" | "monthly" | null>(null);
  const [resetting, setResetting] = useState(false);

  const load = useCallback(
    () =>
      fetch("/api/my-plan")
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((json) => setData(json.data ?? null))
        .catch(() => setData(null)),
    [],
  );

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const meta = data?.meta ?? null;
  const unit = displayUnit(meta?.unit ?? null) || "peças";

  const confirmReset = async () => {
    if (!resetTarget) return;
    setResetting(true);
    try {
      const res = await fetch("/api/my-plan/reset-goal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period: resetTarget }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Erro ao zerar meta");
      showToast("success", "Meta zerada — acumulado e déficit deste período removidos");
      setResetTarget(null);
      load();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao zerar meta");
    } finally {
      setResetting(false);
    }
  };

  const RESET_LABELS: Record<string, string> = {
    daily: "do dia",
    weekly: "da semana",
    monthly: "do mês",
  };
  const today = data?.today ?? "";
  const todayPlans = useMemo(
    () => (data?.plans ?? []).filter((p) => p.plan_date === today),
    [data, today],
  );

  return (
    <div className="relative space-y-6">
      {/* Fundo com grid sutil (padrão da dashboard) — dá leitura ao glass dos cards */}
      <div className="fixed inset-0 bg-grid opacity-30 pointer-events-none" aria-hidden />
      <PageHeader eyebrow="Produção individual" title="Meu Plano" />

      {loading ? (
        <MeuPlanoSkeleton />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Botões "Zerar meta": onReset só é passado para admin — ausentes p/ demais perfis */}
          <MetaDailyCard meta={meta} unit={unit} onReset={isAdmin ? () => setResetTarget("daily") : undefined} />
          <PercentCard meta={meta} />
          <PeriodGoalCard label="Semana" kpi={meta?.weekly ?? null} unit={unit} onReset={isAdmin ? () => setResetTarget("weekly") : undefined} />
          <PeriodGoalCard label="Mês" kpi={meta?.monthly ?? null} unit={unit} onReset={isAdmin ? () => setResetTarget("monthly") : undefined} />
          <PlanCard
            view={planView}
            onViewChange={setPlanView}
            todayPlans={todayPlans}
            allPlans={data?.plans ?? []}
            producedByDay={data?.producedByDay ?? {}}
            producedToday={meta?.progress ?? 0}
            unit={unit}
            isAdmin={isAdmin}
            today={today}
          />
          <HistoryCard
            history={data?.history ?? []}
            unit={unit}
            days={histDays}
            onDaysChange={setHistDays}
          />
        </div>
      )}

      <ConfirmDialog
        open={!!resetTarget}
        onCancel={() => setResetTarget(null)}
        onConfirm={confirmReset}
        title={`Zerar meta ${resetTarget ? RESET_LABELS[resetTarget] : ""}?`}
        description="Esta ação zerará o acumulado e o déficit deste período para este usuário. A automação de fechamento não será afetada."
        confirmLabel="Confirmar zeração"
        variant="warning"
        loading={resetting}
      />
    </div>
  );
}

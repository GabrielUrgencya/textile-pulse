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

/** Pessoa do seletor de admin (GET /api/my-plan/users). */
interface PlanPerson {
  id: string;
  full_name: string | null;
  sector: string | null;
}

const RESET_LABELS: Record<string, string> = {
  daily: "do dia",
  weekly: "da semana",
  monthly: "do mês",
};

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
  // Admin: escolhe DE QUEM é o plano exibido (vazio = o próprio).
  const [people, setPeople] = useState<PlanPerson[]>([]);
  const [viewingUserId, setViewingUserId] = useState<string>("");

  const load = useCallback(
    () =>
      fetch(viewingUserId ? `/api/my-plan?userId=${viewingUserId}` : "/api/my-plan")
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((json) => setData(json.data ?? null))
        .catch(() => setData(null)),
    [viewingUserId],
  );

  // Lista de pessoas para o seletor — só admin (a rota é admin-only).
  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/my-plan/users")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json) => setPeople(json.data ?? []))
      .catch(() => setPeople([]));
  }, [isAdmin]);

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
        // userId: zera a dívida de QUEM está sendo visto (vazio = o próprio admin).
        body: JSON.stringify({ period: resetTarget, ...(viewingUserId ? { userId: viewingUserId } : {}) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Erro ao zerar dívida");
      showToast("success", `Dívida ${RESET_LABELS[resetTarget]} zerada — a meta base continua valendo`);
      setResetTarget(null);
      load();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao zerar meta");
    } finally {
      setResetting(false);
    }
  };

  const today = data?.today ?? "";
  const viewingPerson = viewingUserId ? people.find((p) => p.id === viewingUserId) ?? null : null;
  // Dívida do período que está sendo zerado — mostrada na confirmação para o
  // admin saber o tamanho do que está apagando.
  const resetDeficit = resetTarget ? Math.round(meta?.deficits?.[resetTarget] ?? 0) : 0;
  const todayPlans = useMemo(
    () => (data?.plans ?? []).filter((p) => p.plan_date === today),
    [data, today],
  );

  return (
    <div className="relative space-y-6">
      {/* Fundo com grid sutil (padrão da dashboard) — dá leitura ao glass dos cards */}
      <div className="fixed inset-0 bg-grid opacity-30 pointer-events-none" aria-hidden />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          eyebrow="Produção individual"
          title={viewingPerson ? `Plano de ${viewingPerson.full_name || "operador"}` : "Meu Plano"}
        />
        {/* Seletor de pessoa — só admin. É o que permite zerar a dívida de OUTRO. */}
        {isAdmin && people.length > 0 && (
          <label className="flex items-center gap-2 text-[13px]">
            <span className="text-muted-foreground">Ver plano de:</span>
            <select
              value={viewingUserId}
              onChange={(e) => setViewingUserId(e.target.value)}
              className="h-9 rounded-lg border border-border/60 bg-secondary/40 px-3 text-[13px] outline-none transition-colors hover:bg-secondary focus:border-foreground/30"
            >
              <option value="">Eu mesmo</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name || "—"}{p.sector ? ` · ${p.sector}` : ""}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

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
        title={`Zerar a dívida ${resetTarget ? RESET_LABELS[resetTarget] : ""} de ${viewingPerson ? viewingPerson.full_name || "este operador" : "você mesmo"}?`}
        description={
          `${resetDeficit > 0 ? `Há ${resetDeficit.toLocaleString("pt-BR")} ${unit} de dívida ${resetTarget ? RESET_LABELS[resetTarget] : ""}. ` : ""}` +
          `Limpa APENAS o período ${resetTarget ? RESET_LABELS[resetTarget] : ""} — os outros períodos continuam como estão ` +
          "(para limpar tudo de uma vez, use \"Zerar dívida\" na tela de Equipe). " +
          "A META BASE continua valendo. O fechamento automático não é afetado."
        }
        confirmLabel="Zerar dívida"
        variant="warning"
        loading={resetting}
      />
    </div>
  );
}

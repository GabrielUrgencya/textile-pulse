"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { Plus, Trash2, Loader2, CalendarDays, Target, Users, Globe } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { LisionCard, LisionCardHeader } from "@/components/ui/lision-card";
import { useServerData } from "@/hooks/use-server-data";
import { showToast } from "@/lib/toast";

interface ReferenceTarget {
  id: string;
  reference: string;
  meta_coefficient: number;
  description: string | null;
}
interface Member {
  id: string;
  full_name: string;
}
interface PlanItem {
  reference: string;
  color: string;
  size_label: string;
  quantity: string;
  meta_value: string;
}
interface PlanDraft {
  id: string | null;
  name: string;
  isGeneral: boolean;
  memberIds: string[];
  items: PlanItem[];
  targetOverride: string;
  notes: string;
  saving?: boolean;
}

function todayLocal(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
const emptyItem = (): PlanItem => ({ reference: "", color: "", size_label: "", quantity: "", meta_value: "" });
const emptyPlan = (): PlanDraft => ({
  id: null,
  name: "",
  isGeneral: true,
  memberIds: [],
  items: [emptyItem()],
  targetOverride: "",
  notes: "",
});

export default function DailyPlanPage() {
  const [date, setDate] = useState(todayLocal());
  const [plans, setPlans] = useState<PlanDraft[]>([]);
  const [loading, setLoading] = useState(false);

  const { data: references } = useServerData<ReferenceTarget[]>("/api/settings/references");
  const { data: members } = useServerData<Member[]>("/api/team/members");

  const coefByRef = useCallback(
    (ref: string) => {
      const m = (references || []).find((r) => r.reference.toLowerCase() === ref.trim().toLowerCase());
      return m ? Number(m.meta_coefficient) || 1 : 1;
    },
    [references],
  );

  const loadPlans = useCallback(async (d: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/production/daily-plan?date=${d}&scope=all`);
      const json = await res.json();
      const list: PlanDraft[] = (json.plans || []).map((p: Record<string, unknown>) => ({
        id: p.id as string,
        name: (p.name as string) || "",
        isGeneral: p.is_general !== false,
        memberIds: ((p.members as Array<{ profile_id: string }>) || []).map((m) => m.profile_id),
        targetOverride: p.target_override != null ? String(p.target_override) : "",
        notes: (p.notes as string) || "",
        items:
          ((p.items as Array<Record<string, unknown>>) || []).length > 0
            ? (p.items as Array<Record<string, unknown>>).map((it) => ({
                reference: (it.reference as string) || "",
                color: (it.color as string) || "",
                size_label: (it.size_label as string) || "",
                quantity: it.quantity != null ? String(it.quantity) : "",
                meta_value: it.meta_value != null ? String(it.meta_value) : "",
              }))
            : [emptyItem()],
      }));
      setPlans(list);
    } catch {
      showToast("error", "Erro ao carregar os planos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlans(date);
  }, [date, loadPlans]);

  /* ── mutadores de plano ── */
  const patchPlan = (i: number, patch: Partial<PlanDraft>) =>
    setPlans((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

  const itemMeta = (it: PlanItem): number => {
    if (it.meta_value.trim() !== "") return Number(it.meta_value) || 0;
    const qty = parseInt(it.quantity) || 0;
    if (it.reference.trim() && qty > 0) return Math.round(qty * coefByRef(it.reference) * 100) / 100;
    return 0;
  };
  const planMeta = (p: PlanDraft): number => {
    if (p.targetOverride.trim() !== "") return Number(p.targetOverride) || 0;
    return p.items.reduce((acc, it) => acc + itemMeta(it), 0);
  };

  function toggleMember(i: number, memberId: string) {
    setPlans((prev) =>
      prev.map((p, idx) => {
        if (idx !== i) return p;
        const has = p.memberIds.includes(memberId);
        return { ...p, memberIds: has ? p.memberIds.filter((m) => m !== memberId) : [...p.memberIds, memberId] };
      }),
    );
  }
  function patchItem(pi: number, ii: number, key: keyof PlanItem, value: string) {
    setPlans((prev) =>
      prev.map((p, idx) =>
        idx === pi ? { ...p, items: p.items.map((it, j) => (j === ii ? { ...it, [key]: value } : it)) } : p,
      ),
    );
  }
  function addItem(pi: number) {
    setPlans((prev) => prev.map((p, idx) => (idx === pi ? { ...p, items: [...p.items, emptyItem()] } : p)));
  }
  function removeItem(pi: number, ii: number) {
    setPlans((prev) =>
      prev.map((p, idx) =>
        idx === pi ? { ...p, items: p.items.length > 1 ? p.items.filter((_, j) => j !== ii) : p.items } : p,
      ),
    );
  }

  async function savePlan(i: number) {
    const p = plans[i];
    if (!p.isGeneral && p.memberIds.length === 0) {
      showToast("error", "Plano restrito precisa de ao menos um membro");
      return;
    }
    patchPlan(i, { saving: true });
    try {
      const validItems = p.items.filter(
        (it) => it.reference.trim() || it.color.trim() || it.size_label.trim() || it.quantity.trim(),
      );
      const res = await fetch("/api/production/daily-plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: p.id,
          date,
          name: p.name.trim() || null,
          is_general: p.isGeneral,
          member_ids: p.isGeneral ? [] : p.memberIds,
          target_override: p.targetOverride.trim() === "" ? null : Number(p.targetOverride),
          notes: p.notes.trim() || null,
          items: validItems.map((it) => ({
            reference: it.reference.trim() || null,
            color: it.color.trim() || null,
            size_label: it.size_label.trim() || null,
            quantity: it.quantity.trim() === "" ? null : parseInt(it.quantity),
            meta_value: it.meta_value.trim() === "" ? null : Number(it.meta_value),
          })),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Erro ao salvar");
      }
      showToast("success", "Plano salvo");
      loadPlans(date);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      patchPlan(i, { saving: false });
    }
  }

  async function deletePlan(i: number) {
    const p = plans[i];
    if (!p.id) {
      setPlans((prev) => prev.filter((_, idx) => idx !== i));
      return;
    }
    patchPlan(i, { saving: true });
    try {
      const res = await fetch(`/api/production/daily-plan?id=${p.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      showToast("success", "Plano excluído");
      loadPlans(date);
    } catch {
      showToast("error", "Erro ao excluir");
      patchPlan(i, { saving: false });
    }
  }

  return (
    <div className="max-w-[1100px] mx-auto px-6 lg:px-10 py-6 lg:py-8">
      <PageHeader eyebrow="Produção" title="Plano do Dia" />

      <div className="flex items-end justify-between gap-4 mb-5">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1.5">
            Data do plano
          </label>
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4 text-muted-foreground" />
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input-field" />
          </div>
        </div>
        <button
          onClick={() => setPlans((prev) => [...prev, emptyPlan()])}
          className="h-9 px-4 rounded-lg bg-foreground text-background text-[13px] font-semibold hover:bg-foreground/90 transition flex items-center gap-2"
        >
          <Plus className="size-4" /> Adicionar plano
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-[13px]">
          <Loader2 className="size-4 animate-spin mr-2" /> Carregando…
        </div>
      ) : plans.length === 0 ? (
        <LisionCard>
          <div className="text-center py-10 text-[13px] text-muted-foreground">
            Nenhum plano para esta data. Clique em “Adicionar plano”.
          </div>
        </LisionCard>
      ) : (
        <div className="space-y-5">
          {plans.map((p, pi) => (
            <motion.div key={p.id || `new-${pi}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
              <LisionCard>
                {/* Cabeçalho do plano: nome + público + meta */}
                <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
                  <div className="flex-1 min-w-[200px]">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1.5">
                      Nome do plano (opcional)
                    </label>
                    <input
                      className="input-field"
                      placeholder="Ex: Plano Andiara / Costura"
                      value={p.name}
                      onChange={(e) => patchPlan(pi, { name: e.target.value })}
                      disabled={p.saving}
                    />
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Meta</div>
                    <div className="flex items-center gap-1.5 justify-end">
                      <Target className="size-4 text-muted-foreground" />
                      <span className="font-display text-[20px] font-semibold tabular-nums">
                        {planMeta(p).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Seletor de público */}
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <button
                      onClick={() => patchPlan(pi, { isGeneral: true })}
                      disabled={p.saving}
                      className={`h-8 px-3 rounded-lg border text-[12px] font-medium flex items-center gap-1.5 transition ${
                        p.isGeneral ? "bg-foreground text-background border-foreground" : "bg-secondary/60 border-border/60 hover:bg-secondary"
                      }`}
                    >
                      <Globe className="size-3.5" /> Geral (todos)
                    </button>
                    <button
                      onClick={() => patchPlan(pi, { isGeneral: false })}
                      disabled={p.saving}
                      className={`h-8 px-3 rounded-lg border text-[12px] font-medium flex items-center gap-1.5 transition ${
                        !p.isGeneral ? "bg-foreground text-background border-foreground" : "bg-secondary/60 border-border/60 hover:bg-secondary"
                      }`}
                    >
                      <Users className="size-3.5" /> Membros específicos
                    </button>
                  </div>
                  {!p.isGeneral && (
                    <div className="rounded-lg border border-border/50 p-2.5 max-h-44 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1">
                      {(members || []).length === 0 ? (
                        <span className="text-[12px] text-muted-foreground">Nenhum membro disponível.</span>
                      ) : (
                        (members || []).map((m) => (
                          <label key={m.id} className="flex items-center gap-2 text-[13px] py-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={p.memberIds.includes(m.id)}
                              onChange={() => toggleMember(pi, m.id)}
                              disabled={p.saving}
                            />
                            {m.full_name}
                          </label>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Itens */}
                <LisionCardHeader eyebrow="Itens" title="O que produzir" />
                <div className="space-y-2">
                  {p.items.map((it, ii) => (
                    <div key={ii} className="grid grid-cols-2 md:grid-cols-[1.2fr_1fr_1fr_0.7fr_0.8fr_auto] gap-2 items-center">
                      <input list="ref-list" className="input-field" placeholder="Ref" value={it.reference}
                        onChange={(e) => patchItem(pi, ii, "reference", e.target.value)} disabled={p.saving} />
                      <input className="input-field" placeholder="Cor" value={it.color}
                        onChange={(e) => patchItem(pi, ii, "color", e.target.value)} disabled={p.saving} />
                      <input className="input-field" placeholder="Tamanho/escopo" value={it.size_label}
                        onChange={(e) => patchItem(pi, ii, "size_label", e.target.value)} disabled={p.saving} />
                      <input type="number" min={0} className="input-field tabular-nums text-right" placeholder="Qtd"
                        value={it.quantity} onChange={(e) => patchItem(pi, ii, "quantity", e.target.value)} disabled={p.saving} />
                      <input type="number" step="0.01" min={0} className="input-field tabular-nums text-right"
                        placeholder={itemMeta(it) ? String(itemMeta(it)) : "auto"} value={it.meta_value}
                        onChange={(e) => patchItem(pi, ii, "meta_value", e.target.value)} disabled={p.saving}
                        title="Vazio = calculado pela referência × quantidade" />
                      <button onClick={() => removeItem(pi, ii)} disabled={p.items.length === 1 || p.saving}
                        className="p-2 rounded-md hover:bg-secondary text-destructive disabled:opacity-30" title="Remover item">
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <button onClick={() => addItem(pi)} disabled={p.saving}
                  className="mt-3 h-8 px-3 rounded-lg bg-secondary/60 border border-border/60 text-[12px] font-medium hover:bg-secondary transition flex items-center gap-1.5">
                  <Plus className="size-3.5" /> Adicionar item
                </button>

                {/* Override + notas + ações */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-border/40">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1.5">
                      Meta (override — vazio = soma)
                    </label>
                    <input type="number" step="0.01" min={0} className="input-field tabular-nums"
                      value={p.targetOverride} onChange={(e) => patchPlan(pi, { targetOverride: e.target.value })} disabled={p.saving} />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1.5">Observações</label>
                    <input className="input-field" value={p.notes}
                      onChange={(e) => patchPlan(pi, { notes: e.target.value })} disabled={p.saving} />
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-4">
                  <button onClick={() => savePlan(pi)} disabled={p.saving}
                    className="flex-1 h-10 rounded-lg bg-foreground text-background text-[13px] font-semibold hover:bg-foreground/90 disabled:opacity-50 transition flex items-center justify-center gap-2">
                    {p.saving ? <Loader2 className="size-4 animate-spin" /> : null}
                    {p.id ? "Salvar plano" : "Criar plano"}
                  </button>
                  <button onClick={() => deletePlan(pi)} disabled={p.saving}
                    className="h-10 px-4 rounded-lg bg-secondary/60 border border-border/60 text-[13px] font-medium hover:bg-destructive/10 hover:text-destructive transition flex items-center gap-2">
                    <Trash2 className="size-4" /> Excluir
                  </button>
                </div>
              </LisionCard>
            </motion.div>
          ))}
        </div>
      )}

      <datalist id="ref-list">
        {(references || []).map((r) => (
          <option key={r.id} value={r.reference}>
            coef {r.meta_coefficient}
            {r.description ? ` — ${r.description}` : ""}
          </option>
        ))}
      </datalist>
    </div>
  );
}

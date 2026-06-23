"use client";

import * as React from "react";
import { LisionCard, LisionCardHeader } from "@/components/ui/lision-card";
import { Button } from "@/components/ui/button";
import { useServerData } from "@/hooks/use-server-data";
import { showToast } from "@/lib/toast";
import { Skeleton } from "@/components/ui/skeleton";
import { SectorTargetsCard } from "./SectorTargetsCard";

/* ───────────── Types ───────────── */
interface Stage { id: string; name: string; display_name: string; order_index: number }
interface Reference { id: string; reference: string }
interface Member { id: string; full_name: string; sector: string | null; is_active: boolean }
interface RefStageTarget { reference: string; stage_id: string; coefficient: number }
interface UserTarget { user_id: string; stage_id: string; daily_target: number | null; unit: string | null }

function AdvancedTargetsConfig() {
  const { data: stages, isLoading: l1 } = useServerData<Stage[]>("/api/settings/stages");
  const { data: references } = useServerData<Reference[]>("/api/settings/references");
  const { data: members } = useServerData<Member[]>("/api/team/members");
  const { data: refStageTargets, refetch: refetchRST } = useServerData<RefStageTarget[]>("/api/settings/reference-stage-targets");
  const { data: userTargets, refetch: refetchUT } = useServerData<UserTarget[]>("/api/settings/user-targets");

  const sortedStages = React.useMemo(
    () => [...(stages || [])].sort((a, b) => a.order_index - b.order_index),
    [stages],
  );

  if (l1) {
    return (
      <LisionCard>
        <Skeleton className="h-6 w-40 mb-6" />
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      </LisionCard>
    );
  }

  return (
    <div className="space-y-6">
      <SectorTargetsCard />
      <CoefficientGrid stages={sortedStages} references={references || []} refStageTargets={refStageTargets || []} onSaved={refetchRST} />
      <UserTargetsEditor stages={sortedStages} members={members || []} userTargets={userTargets || []} onSaved={refetchUT} />
    </div>
  );
}

/* ───────────── 2) Coeficiente referência × etapa ───────────── */
function CoefficientGrid({ stages, references, refStageTargets, onSaved }: { stages: Stage[]; references: Reference[]; refStageTargets: RefStageTarget[]; onSaved: () => void }) {
  const [ref, setRef] = React.useState("");
  const key = (r: string, s: string) => `${r}|${s}`;
  const map = new Map(refStageTargets.map((c) => [key(c.reference, c.stage_id), Number(c.coefficient)]));
  const [draft, setDraft] = React.useState<Record<string, string>>({});

  function val(stageId: string) {
    const k = key(ref, stageId);
    if (draft[k] !== undefined) return draft[k];
    const c = map.get(k);
    return c !== undefined ? String(c) : "";
  }
  async function saveAll() {
    if (!ref) { showToast("error", "Escolha uma referência"); return; }
    try {
      for (const st of stages) {
        const raw = val(st.id);
        if (raw === "") continue;
        const coef = Number(raw);
        if (Number.isNaN(coef) || coef < 0) continue;
        const res = await fetch("/api/settings/reference-stage-targets", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reference: ref, stage_id: st.id, coefficient: coef }),
        });
        if (!res.ok) throw new Error();
      }
      showToast("success", `Coeficientes da referência ${ref} salvos`);
      setDraft({});
      onSaved();
    } catch { showToast("error", "Erro ao salvar coeficientes"); }
  }

  return (
    <LisionCard>
      <LisionCardHeader eyebrow="Produtividade" title="Coeficiente por Referência × Etapa" />
      <p className="text-xs text-muted-foreground/70 mb-4">Quanto cada conjunto vale em cada etapa. Ex: 1027 → Travete 20, Produção 2, Embalagem 1.</p>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[12px] text-muted-foreground">Referência:</span>
        <input list="ref-list" className="input-field max-w-[200px]" placeholder="Ex: 1027" value={ref} onChange={(e) => { setRef(e.target.value); setDraft({}); }} />
        <datalist id="ref-list">{references.map((r) => <option key={r.id} value={r.reference} />)}</datalist>
      </div>
      {ref ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
            {stages.map((st) => (
              <div key={st.id}>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">{st.display_name}</label>
                <input type="number" step="0.01" min={0} className="input-field tabular-nums" placeholder="1.0"
                  value={val(st.id)} onChange={(e) => setDraft((p) => ({ ...p, [`${ref}|${st.id}`]: e.target.value }))} />
              </div>
            ))}
          </div>
          <Button onClick={saveAll}>Salvar coeficientes</Button>
        </>
      ) : (
        <p className="text-[13px] text-muted-foreground py-4">Selecione/digite uma referência para editar os coeficientes por etapa.</p>
      )}
    </LisionCard>
  );
}

/* ───────────── 3) Override por usuário ───────────── */
function UserTargetsEditor({ stages, members, userTargets, onSaved }: { stages: Stage[]; members: Member[]; userTargets: UserTarget[]; onSaved: () => void }) {
  const map = new Map(userTargets.map((u) => [u.user_id, u]));
  const [draft, setDraft] = React.useState<Record<string, { stage: string; target: string; unit: string }>>({});
  const active = members.filter((m) => m.is_active);

  function val(userId: string) {
    const d = draft[userId];
    if (d) return d;
    const u = map.get(userId);
    return { stage: u?.stage_id ?? "", target: u?.daily_target != null ? String(u.daily_target) : "", unit: u?.unit ?? "" };
  }
  function set(userId: string, key: "stage" | "target" | "unit", value: string) {
    setDraft((p) => ({ ...p, [userId]: { ...val(userId), [key]: value } }));
  }
  async function save(userId: string) {
    const v = val(userId);
    if (!v.stage) { showToast("error", "Escolha a etapa do usuário"); return; }
    try {
      const res = await fetch("/api/settings/user-targets", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, stage_id: v.stage, daily_target: v.target || null, unit: v.unit.trim() || null }),
      });
      if (!res.ok) throw new Error();
      showToast("success", "Meta do usuário salva");
      onSaved();
    } catch { showToast("error", "Erro ao salvar"); }
  }
  async function remove(userId: string) {
    try {
      const res = await fetch(`/api/settings/user-targets?user_id=${userId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      showToast("success", "Override removido");
      setDraft((p) => { const n = { ...p }; delete n[userId]; return n; });
      onSaved();
    } catch { showToast("error", "Erro ao remover"); }
  }

  return (
    <LisionCard>
      <LisionCardHeader eyebrow="Produtividade" title="Meta por Usuário (override)" />
      <p className="text-xs text-muted-foreground/70 mb-4">Opcional: define a etapa e a meta de um funcionário específico (prevalece sobre a do setor). Ex: Maria → Travete, 2500.</p>
      <div className="space-y-2 max-h-[420px] overflow-y-auto">
        {active.map((m) => {
          const v = val(m.id);
          const hasOverride = map.has(m.id);
          return (
            <div key={m.id} className="grid grid-cols-[1fr_130px_110px_120px_auto] gap-2 items-center">
              <span className="text-[13px] font-medium truncate">{m.full_name}</span>
              <select className="input-field" value={v.stage} onChange={(e) => set(m.id, "stage", e.target.value)}>
                <option value="">— etapa —</option>
                {stages.map((st) => <option key={st.id} value={st.id}>{st.display_name}</option>)}
              </select>
              <input type="number" min={0} className="input-field tabular-nums" placeholder="meta" value={v.target} onChange={(e) => set(m.id, "target", e.target.value)} />
              <input className="input-field" placeholder="unidade" value={v.unit} onChange={(e) => set(m.id, "unit", e.target.value)} />
              <div className="flex gap-1">
                <Button onClick={() => save(m.id)} className="h-9">Salvar</Button>
                {hasOverride && (
                  <button onClick={() => remove(m.id)} className="h-9 px-2 rounded-md border border-border/60 text-[12px] text-destructive hover:bg-secondary/60">×</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </LisionCard>
  );
}

export { AdvancedTargetsConfig };

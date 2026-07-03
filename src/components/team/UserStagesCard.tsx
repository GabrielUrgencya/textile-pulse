"use client";

import * as React from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { LisionCard, LisionCardHeader } from "@/components/ui/lision-card";
import { showToast } from "@/lib/toast";

/**
 * Story 9.4 — Atribuição de setor(es) por colaborador.
 * Admin/gerente marca em quais setores cada operador pode bipar. Auto-save por
 * toggle (substitui o conjunto do usuário via PUT /api/settings/user-stages).
 * Operadores sem nenhum setor ficam bloqueados na bipagem (enforcement no /api/scan).
 */

interface Member {
  id: string;
  full_name: string;
  role: string;
  is_active: boolean;
}
interface Stage {
  id: string;
  name: string;
  display_name?: string | null;
}

const RESTRICTED_ROLES = new Set(["COORDENADOR", "OPERADOR", "FACCAO"]); // ADMIN/GERENTE são isentos

export function UserStagesCard() {
  const [members, setMembers] = React.useState<Member[]>([]);
  const [stages, setStages] = React.useState<Stage[]>([]);
  const [assign, setAssign] = React.useState<Record<string, Set<string>>>({});
  const [loading, setLoading] = React.useState(true);
  const [savingUser, setSavingUser] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        const [mRes, sRes, aRes] = await Promise.all([
          fetch("/api/team/members", { credentials: "same-origin" }),
          fetch("/api/settings/stages", { credentials: "same-origin" }),
          fetch("/api/settings/user-stages", { credentials: "same-origin" }),
        ]);
        const m = (mRes.ok ? (await mRes.json()).data : []) as Member[];
        const s = (sRes.ok ? (await sRes.json()).data : []) as Stage[];
        const a = (aRes.ok ? (await aRes.json()).data : []) as Array<{ user_id: string; stage_id: string }>;
        const map: Record<string, Set<string>> = {};
        for (const r of a) (map[r.user_id] ||= new Set()).add(r.stage_id);
        setMembers(m.filter((x) => x.is_active && RESTRICTED_ROLES.has(x.role)));
        setStages(s);
        setAssign(map);
      } catch {
        showToast("error", "Falha ao carregar atribuições de setor");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggle = React.useCallback(
    async (userId: string, stageId: string) => {
      const prevSet = assign[userId] ?? new Set<string>();
      const next = new Set(prevSet);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      setAssign((p) => ({ ...p, [userId]: next }));
      setSavingUser(userId);
      try {
        const res = await fetch("/api/settings/user-stages", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ user_id: userId, stage_ids: Array.from(next) }),
        });
        if (!res.ok) throw new Error();
      } catch {
        // reverte em caso de erro
        setAssign((p) => ({ ...p, [userId]: prevSet }));
        showToast("error", "Não foi possível salvar o setor");
      } finally {
        setSavingUser(null);
      }
    },
    [assign],
  );

  const stageLabel = (s: Stage) => s.display_name || s.name;

  return (
    <LisionCard className="mt-4">
      <LisionCardHeader
        eyebrow="Governança"
        title="Setores por colaborador"
        right={<ShieldCheck className="size-4 text-muted-foreground/60" />}
      />
      <p className="text-[12px] text-muted-foreground -mt-2 mb-4">
        Marque em quais setores cada operador pode bipar. Sem nenhum setor, o operador fica
        bloqueado na bipagem. Administradores e gerentes bipam em qualquer setor.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground py-6">
          <Loader2 className="size-4 animate-spin" /> Carregando…
        </div>
      ) : members.length === 0 ? (
        <div className="text-[13px] text-muted-foreground py-6">Nenhum operador ativo para atribuir.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-muted-foreground/70">
                <th className="py-2 pr-4 font-medium sticky left-0 bg-card">Colaborador</th>
                {stages.map((s) => (
                  <th key={s.id} className="py-2 px-2 font-medium text-center whitespace-nowrap">
                    {stageLabel(s)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const set = assign[m.id] ?? new Set<string>();
                const none = set.size === 0;
                return (
                  <tr key={m.id} className="border-t border-border/40">
                    <td className="py-2 pr-4 sticky left-0 bg-card">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{m.full_name}</span>
                        {savingUser === m.id && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
                        {none && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/15 text-destructive">
                            bloqueado
                          </span>
                        )}
                      </div>
                    </td>
                    {stages.map((s) => {
                      const on = set.has(s.id);
                      return (
                        <td key={s.id} className="py-2 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => toggle(m.id, s.id)}
                            aria-pressed={on}
                            title={`${on ? "Remover" : "Atribuir"} ${stageLabel(s)}`}
                            className={`size-6 rounded-md border transition-colors ${
                              on
                                ? "bg-foreground border-transparent text-background"
                                : "bg-secondary/40 border-border/50 hover:bg-secondary"
                            }`}
                          >
                            {on ? "✓" : ""}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </LisionCard>
  );
}

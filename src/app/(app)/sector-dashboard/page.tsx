"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Lock, Save, Loader2, Tv } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { useUserProfile } from "@/hooks/use-user-profile";
import { usePermissions } from "@/hooks/use-permissions";
import {
  isFactionPanelVisible,
  setFactionPanel,
  DEFAULT_SECTOR_LAYOUT,
  type KPIWidget,
} from "@/lib/dashboard-config";
import { cn } from "@/lib/utils";

/**
 * Config. da TV (redesign): a TV nova ("Instrumento") usa layout FIXO em todos os
 * setores de propósito (unidade visual). A única coisa editável por setor são os
 * toggles que a TV REALMENTE aplica — e cada um obedece de verdade:
 *   • Status da Facção (presença do widget faccao_status no layout).
 * O builder antigo de widgets foi aposentado (a TV o ignorava → "salvava e não
 * aplicava"). Nada de tela que mente: só mostramos o que a TV honra.
 */

interface Stage {
  id: string;
  name: string;
  display_name?: string;
}

function Switch({ checked, onClick, label }: { checked: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors",
        checked ? "border-transparent bg-foreground" : "border-border bg-secondary",
      )}
    >
      <span className={cn("size-4 rounded-full bg-background transition-transform", checked ? "translate-x-6" : "translate-x-1")} />
    </button>
  );
}

export default function SectorDashboardConfigPage() {
  const { profile, isLoading: profileLoading } = useUserProfile();
  const { can: hasPerm, isLoading: permsLoading } = usePermissions();
  const tvAllowed = permsLoading ? profile?.role === "ADMIN" : hasPerm("tv:config");

  const [stages, setStages] = useState<Stage[]>([]);
  const [stageId, setStageId] = useState<string | null>(null);
  // Guardamos o layout só para preservar o widget de facção (a TV lê a presença dele).
  const [layout, setLayout] = useState<KPIWidget[]>([]);
  const [factionOn, setFactionOn] = useState(true);
  const [saved, setSaved] = useState<string>("");
  const [loadingCfg, setLoadingCfg] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [openingTv, setOpeningTv] = useState(false);

  const snapshot = useMemo(() => JSON.stringify({ factionOn }), [factionOn]);
  const dirty = saved !== "" && snapshot !== saved;

  // Setores (ativos)
  useEffect(() => {
    fetch("/api/settings/stages", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => {
        const list = (j.data || []) as Stage[];
        setStages(list);
        setStageId((cur) => cur ?? (list[0]?.id ?? null));
      })
      .catch(() => setStages([]));
  }, []);

  // Config do setor selecionado
  useEffect(() => {
    if (!stageId) return;
    setLoadingCfg(true);
    setFeedback(null);
    fetch(`/api/sector-dashboard-config?stage_id=${stageId}`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const l = (j?.data?.layout || DEFAULT_SECTOR_LAYOUT) as KPIWidget[];
        const fOn = isFactionPanelVisible(l);
        setLayout(l);
        setFactionOn(fOn);
        setSaved(JSON.stringify({ factionOn: fOn }));
      })
      .catch(() => {
        setLayout(DEFAULT_SECTOR_LAYOUT);
        setFactionOn(true);
        setSaved(JSON.stringify({ factionOn: true }));
      })
      .finally(() => setLoadingCfg(false));
  }, [stageId]);

  const save = useCallback(async () => {
    if (!stageId) return;
    setSaving(true);
    setFeedback(null);
    try {
      const nextLayout = setFactionPanel(layout.length ? layout : DEFAULT_SECTOR_LAYOUT, factionOn);
      const res = await fetch("/api/sector-dashboard-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ stage_id: stageId, layout: nextLayout }),
      });
      if (res.ok) {
        setLayout(nextLayout);
        setSaved(JSON.stringify({ factionOn }));
        setFeedback("Publicado! A TV deste setor atualiza em instantes.");
      } else {
        const j = await res.json().catch(() => null);
        setFeedback(j?.error || "Falha ao salvar.");
      }
    } catch {
      setFeedback("Erro de conexão.");
    } finally {
      setSaving(false);
    }
  }, [stageId, layout, factionOn]);

  const openSectorTv = useCallback(async () => {
    if (!stageId || openingTv) return;
    setOpeningTv(true);
    try {
      let token: string | null = null;
      const listRes = await fetch("/api/admin/kiosk-tokens", { credentials: "same-origin" });
      if (listRes.ok) {
        const { tokens } = await listRes.json();
        const active = (tokens || []).find(
          (t: { token: string; scope: string; is_active: boolean }) => t.is_active && t.scope === "dashboard",
        );
        if (active) token = active.token;
      }
      if (!token) {
        const createRes = await fetch("/api/admin/kiosk-tokens", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ name: "TV Painel", scope: "dashboard" }),
        });
        if (createRes.ok) {
          const { token: created } = await createRes.json();
          token = created.token;
        }
      }
      if (token) window.open(`/tv?token=${token}&stage=${stageId}`, "_blank", "noopener");
      else setFeedback("Não foi possível gerar o link da TV.");
    } catch {
      setFeedback("Erro ao abrir a TV do setor.");
    } finally {
      setOpeningTv(false);
    }
  }, [stageId, openingTv]);

  if (!profileLoading && profile && !tvAllowed) {
    return (
      <div className="max-w-[900px] mx-auto px-6 py-16 text-center">
        <Lock className="size-10 mx-auto text-muted-foreground/40 mb-3" />
        <h2 className="text-[18px] font-semibold">Acesso restrito</h2>
        <p className="text-[13px] text-muted-foreground mt-1">Peça ao administrador a permissão &quot;Config. da TV&quot;.</p>
      </div>
    );
  }

  return (
    <div className="max-w-[900px] mx-auto px-6 lg:px-10 py-6 lg:py-8">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <PageHeader eyebrow="Tela de TV" title="Configuração da TV por Setor" />
        <div className="flex items-center gap-2">
          {feedback && <span className="text-[12px] text-muted-foreground">{feedback}</span>}
          <button
            type="button"
            onClick={openSectorTv}
            disabled={!stageId || openingTv}
            title="Abre a TV travada neste setor"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-secondary/60 border border-border/50 hover:bg-secondary transition-colors text-[13px] disabled:opacity-50"
          >
            {openingTv ? <Loader2 className="size-4 animate-spin" /> : <Tv className="size-4" />} Abrir TV do setor
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving || !stageId}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-foreground text-background font-medium hover:opacity-90 transition-opacity text-[13px] disabled:opacity-40"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Salvar e publicar
          </button>
        </div>
      </div>

      {/* Seletor de setor */}
      <div className="mt-5 flex flex-wrap gap-2">
        {stages.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStageId(s.id)}
            className={cn(
              "h-9 rounded-lg border px-3 text-[13px] transition-colors",
              s.id === stageId ? "border-foreground/30 bg-foreground text-background" : "border-border/60 bg-secondary/40 hover:bg-secondary",
            )}
          >
            {s.display_name || s.name}
          </button>
        ))}
      </div>

      <p className="mt-4 text-[12px] text-muted-foreground">
        A TV usa o mesmo layout em todos os setores (unidade visual). Aqui você ajusta,
        por setor, só o que a TV realmente aplica — cada opção obedece na hora.
      </p>

      {loadingCfg ? (
        <div className="mt-4 h-40 rounded-xl bg-secondary/30 animate-pulse" />
      ) : (
        <div className="mt-4 space-y-3">
          {/* Toggle: Status da Facção */}
          <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 bg-secondary/30 p-4">
            <div className="min-w-0">
              <p className="text-[14px] font-medium">Mostrar &quot;Status da Facção&quot; na TV</p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                Desligue nos setores que não acompanham facção — o painel some da TV e o
                ranking ocupa o espaço.
              </p>
            </div>
            <Switch checked={factionOn} onClick={() => setFactionOn((v) => !v)} label="Mostrar Status da Facção na TV" />
          </div>
        </div>
      )}
    </div>
  );
}

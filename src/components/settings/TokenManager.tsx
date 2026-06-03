"use client";

import * as React from "react";
import { Copy, Plus, ShieldAlert } from "lucide-react";
import { LisionCard, LisionCardHeader } from "@/components/ui/lision-card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TokenDisplay } from "@/components/settings/TokenDisplay";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { useServerData } from "@/hooks/use-server-data";
import { showToast } from "@/lib/toast";
import { Skeleton } from "@/components/ui/skeleton";

/* ── Types ── */

interface KioskToken {
  id: string;
  token: string;
  name: string;
  scope: string;
  is_active: boolean;
  created_at: string;
}

interface FactionToken {
  id: string;
  token: string;
  name: string;
  faction_id: string;
  is_active: boolean;
  created_at: string;
  factions?: { name: string };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

/* ── TokenManager Component ── */

function TokenManager() {
  const {
    data: kioskData,
    isLoading: kioskLoading,
    refetch: refetchKiosk,
  } = useServerData<{ tokens: KioskToken[] }>("/api/admin/kiosk-tokens");

  const {
    data: factionData,
    isLoading: factionLoading,
    refetch: refetchFaction,
  } = useServerData<{ tokens: FactionToken[] }>("/api/admin/faction-tokens");

  const [revokeTarget, setRevokeTarget] = React.useState<{
    id: string;
    type: "kiosk" | "faction";
    name: string;
  } | null>(null);
  const [revoking, setRevoking] = React.useState(false);

  // Create kiosk token dialog
  const [showCreateKiosk, setShowCreateKiosk] = React.useState(false);
  const [kioskName, setKioskName] = React.useState("");
  const [createdToken, setCreatedToken] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

  const handleCreateKiosk = async () => {
    if (!kioskName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/admin/kiosk-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: kioskName.trim() }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCreatedToken(data.token?.token || "");
      showToast("success", "Token kiosk criado");
      refetchKiosk();
    } catch {
      showToast("error", "Erro ao criar token");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    const url =
      revokeTarget.type === "kiosk"
        ? `/api/admin/kiosk-tokens/${revokeTarget.id}`
        : `/api/admin/faction-tokens/${revokeTarget.id}`;

    try {
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) throw new Error();
      showToast("success", "Token revogado");
      setRevokeTarget(null);
      if (revokeTarget.type === "kiosk") refetchKiosk();
      else refetchFaction();
    } catch {
      showToast("error", "Erro ao revogar token");
    } finally {
      setRevoking(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast("success", "Copiado!");
  };

  const isLoading = kioskLoading || factionLoading;

  if (isLoading) {
    return (
      <LisionCard>
        <Skeleton className="h-6 w-40 mb-6" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      </LisionCard>
    );
  }

  const kioskTokens = kioskData?.tokens || [];
  const factionTokens = factionData?.tokens || [];

  return (
    <>
      <div className="space-y-6">
        {/* Kiosk Tokens */}
        <LisionCard>
          <LisionCardHeader
            eyebrow="Acesso"
            title="Tokens Kiosk"
            right={
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowCreateKiosk(true);
                  setKioskName("");
                  setCreatedToken(null);
                }}
                className="gap-1.5"
              >
                <Plus className="size-3.5" />
                Novo Token Kiosk
              </Button>
            }
          />

          <div className="space-y-2">
            {kioskTokens.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                Nenhum token kiosk cadastrado.
              </p>
            )}
            {kioskTokens.map((t) => (
              <TokenDisplay
                key={t.id}
                token={t.token}
                label={t.name}
                sublabel={formatDate(t.created_at)}
                isActive={t.is_active}
                onRevoke={() => setRevokeTarget({ id: t.id, type: "kiosk", name: t.name })}
                onCopy={() => copyToClipboard(t.token)}
              />
            ))}
          </div>
        </LisionCard>

        {/* Faction Tokens */}
        <LisionCard>
          <LisionCardHeader
            eyebrow="Acesso"
            title="Tokens Facção"
            right={
              <ShieldAlert className="size-4 text-muted-foreground/30" />
            }
          />

          <div className="space-y-2">
            {factionTokens.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                Nenhum token de facção cadastrado.
              </p>
            )}
            {factionTokens.map((t) => (
              <TokenDisplay
                key={t.id}
                token={t.token}
                label={t.name}
                sublabel={t.factions?.name ? `${t.factions.name} — ${formatDate(t.created_at)}` : formatDate(t.created_at)}
                isActive={t.is_active}
                onRevoke={() => setRevokeTarget({ id: t.id, type: "faction", name: t.name })}
                onCopy={() => copyToClipboard(t.token)}
              />
            ))}
          </div>
        </LisionCard>
      </div>

      {/* Create Kiosk Token Dialog */}
      <Dialog open={showCreateKiosk} onOpenChange={setShowCreateKiosk}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Novo Token Kiosk</DialogTitle>
            <DialogDescription>Gerencie tokens de acesso.</DialogDescription>
          </DialogHeader>

          {createdToken ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Token criado. Copie a URL abaixo — ela não será exibida novamente.
              </p>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/30 border border-border/40">
                <code className="text-xs font-mono flex-1 break-all">{createdToken}</code>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => copyToClipboard(createdToken)}
                >
                  <Copy className="size-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Nome do token</label>
                <input
                  className="input-field"
                  value={kioskName}
                  onChange={(e) => setKioskName(e.target.value)}
                  placeholder="Ex: TV Produção"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            {!createdToken && (
              <Button onClick={handleCreateKiosk} disabled={creating || !kioskName.trim()}>
                {creating ? "Criando..." : "Criar Token"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Confirm */}
      <ConfirmDialog
        open={!!revokeTarget}
        onConfirm={handleRevoke}
        onCancel={() => setRevokeTarget(null)}
        title={`Revogar "${revokeTarget?.name}"?`}
        description="O token será invalidado imediatamente."
        confirmLabel="Revogar"
        variant="destructive"
        loading={revoking}
      />
    </>
  );
}

export { TokenManager };

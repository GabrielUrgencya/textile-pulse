"use client";

import * as React from "react";
import { Check, Copy, Link2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface TokenDisplayProps {
  token: string;
  expiresAt?: string | null;
  onRevoke?: () => void;
  onCopy?: () => void;
  label?: string;
  sublabel?: string;
  isActive?: boolean;
  /**
   * Frente 4: link pronto do Portal da Facção (ex.: .../portal?token=UUID).
   * Quando presente, exibe um botão "Copiar link" — é o que o admin manda no
   * WhatsApp; a facção abre e entra só com o PIN, sem lidar com "token".
   */
  copyLink?: string;
  /** Callback após copiar o link (feedback/toast). */
  onCopyLink?: () => void;
}

function maskToken(token: string): string {
  if (!token || token.length < 4) return token || "";
  const last4 = token.slice(-4);
  return `${"•".repeat(8)}${last4}`;
}

function getExpiryInfo(expiresAt: string | null | undefined): { label: string; variant: "warning" | "destructive" | "neutral" } | null {
  if (!expiresAt) return null;

  const now = new Date();
  const expiry = new Date(expiresAt);
  const diffMs = expiry.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { label: "Expirado", variant: "destructive" };
  }
  if (diffDays <= 7) {
    return { label: `Expira em ${diffDays}d`, variant: "warning" };
  }
  return { label: `Expira em ${diffDays}d`, variant: "neutral" };
}

function TokenDisplay({
  token,
  expiresAt,
  onRevoke,
  onCopy,
  label,
  sublabel,
  isActive = true,
  copyLink,
  onCopyLink,
}: TokenDisplayProps) {
  const [copied, setCopied] = React.useState(false);
  const [linkCopied, setLinkCopied] = React.useState(false);
  const [showRevoke, setShowRevoke] = React.useState(false);

  const handleCopy = React.useCallback(() => {
    navigator.clipboard.writeText(token).then(() => {
      setCopied(true);
      onCopy?.();
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, [token, onCopy]);

  const handleCopyLink = React.useCallback(() => {
    if (!copyLink) return;
    navigator.clipboard.writeText(copyLink).then(() => {
      setLinkCopied(true);
      onCopyLink?.();
      setTimeout(() => setLinkCopied(false), 2000);
    }).catch(() => {});
  }, [copyLink, onCopyLink]);

  const expiryInfo = getExpiryInfo(expiresAt);

  return (
    <>
      <div className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-secondary/20">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            {label && <div className="text-sm font-medium truncate">{label}</div>}
            {sublabel && (
              <div className="text-xs text-muted-foreground truncate">{sublabel}</div>
            )}
            <div className="text-xs text-muted-foreground font-mono mt-0.5">
              {maskToken(token)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {expiryInfo && (
            <StatusBadge status={expiryInfo.variant}>{expiryInfo.label}</StatusBadge>
          )}
          <StatusBadge status={isActive ? "success" : "neutral"}>
            {isActive ? "ATIVO" : "INATIVO"}
          </StatusBadge>
          {copyLink && isActive && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              onClick={handleCopyLink}
              title="Copiar link de acesso do Portal da Facção"
            >
              {linkCopied ? (
                <Check className="size-3.5 text-success" />
              ) : (
                <Link2 className="size-3.5" />
              )}
              <span className="text-xs">{linkCopied ? "Copiado" : "Copiar link"}</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={handleCopy}
            title="Copiar token"
          >
            {copied ? (
              <Check className="size-3.5 text-success" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </Button>
          {onRevoke && isActive && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-destructive hover:text-destructive"
              onClick={() => setShowRevoke(true)}
              title="Revogar token"
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      {onRevoke && (
        <ConfirmDialog
          open={showRevoke}
          onConfirm={() => {
            setShowRevoke(false);
            onRevoke();
          }}
          onCancel={() => setShowRevoke(false)}
          title={`Revogar "${label || "token"}"?`}
          description="O token será invalidado imediatamente."
          confirmLabel="Revogar"
          variant="destructive"
        />
      )}
    </>
  );
}

export { TokenDisplay, type TokenDisplayProps };

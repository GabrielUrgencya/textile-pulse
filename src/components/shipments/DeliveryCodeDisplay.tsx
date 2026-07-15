"use client";

import { useState } from "react";
import { Copy, Check, RefreshCw, Clock } from "lucide-react";
import { TENANT_TZ } from "@/lib/tz";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface DeliveryCodeDisplayProps {
  code: string | null;
  expiresAt: string | null;
  expired?: boolean;
  onRegenerate?: () => void;
  regenerating?: boolean;
}

export function DeliveryCodeDisplay({
  code,
  expiresAt,
  expired,
  onRegenerate,
  regenerating,
}: DeliveryCodeDisplayProps) {
  const [copied, setCopied] = useState(false);

  if (!code) {
    return (
      <div className="rounded-lg border border-dashed border-muted-foreground/30 p-4 text-center text-sm text-muted-foreground">
        Sem código de entrega
      </div>
    );
  }

  const formatted = `${code.slice(0, 3)} — ${code.slice(3)}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const expiresDate = expiresAt ? new Date(expiresAt) : null;
  const isExpired = expired ?? (expiresDate ? expiresDate < new Date() : false);

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg bg-accent/10 p-6">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Código de Entrega
      </p>

      <p
        className={`font-mono text-[64px] font-bold leading-none tracking-[0.15em] ${
          isExpired ? "text-muted-foreground line-through" : "text-foreground"
        }`}
      >
        {formatted}
      </p>

      <p className="text-[12px] text-muted-foreground text-center max-w-[260px]">
        Passe este código ao motorista — ele o entrega à facção, que o digita no portal para confirmar o recebimento.
      </p>

      <div className="flex items-center gap-2">
        {isExpired ? (
          <Badge variant="destructive">Expirado</Badge>
        ) : (
          expiresDate && (
            <Badge variant="secondary" className="gap-1">
              <Clock className="h-3 w-3" />
              Expira{" "}
              {expiresDate.toLocaleString("pt-BR", {
                timeZone: TENANT_TZ,
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Badge>
          )
        )}
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          disabled={isExpired}
          aria-live="polite"
          className={copied ? "text-success border-success/40" : ""}
        >
          {copied ? (
            <>
              <Check className="mr-1 h-3 w-3" />
              Copiado!
            </>
          ) : (
            <>
              <Copy className="mr-1 h-3 w-3" />
              Copiar
            </>
          )}
        </Button>

        {isExpired && onRegenerate && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRegenerate}
            disabled={regenerating}
          >
            <RefreshCw
              className={`mr-1 h-3 w-3 ${regenerating ? "animate-spin" : ""}`}
            />
            Gerar Novo
          </Button>
        )}
      </div>
    </div>
  );
}

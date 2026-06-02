"use client";

import * as React from "react";
import { KeyRound } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { showToast } from "@/lib/toast";

interface PinResetPopoverProps {
  memberId: string;
  memberName: string;
}

function PinResetPopover({ memberId, memberName }: PinResetPopoverProps) {
  const [open, setOpen] = React.useState(false);
  const [pin, setPin] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [secondsLeft, setSecondsLeft] = React.useState(0);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = React.useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    return clearTimer;
  }, [clearTimer]);

  const handleReset = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/team/members/${memberId}/reset-pin`, {
        method: "PATCH",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Erro ao resetar PIN");
      }
      const json = await res.json();
      const newPin = json.data.pin;
      setPin(newPin);
      setSecondsLeft(30);
      showToast("success", `PIN de ${memberName} resetado`);

      clearTimer();
      timerRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            clearTimer();
            setPin(null);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao resetar PIN");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) {
      setPin(null);
      setSecondsLeft(0);
      clearTimer();
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5">
          <KeyRound className="size-3.5" />
          <span className="hidden sm:inline">Reset PIN</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        {!pin ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Novo PIN sera gerado. Anote e entregue ao operador.
            </p>
            <Button
              size="sm"
              onClick={handleReset}
              disabled={loading}
              className="w-full"
            >
              {loading ? "Gerando..." : "Confirmar Reset"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3 text-center">
            <p className="text-xs text-muted-foreground">Novo PIN:</p>
            <div className="font-mono text-3xl font-bold tracking-[0.3em] text-foreground">
              {pin}
            </div>
            <div className="text-xs text-muted-foreground">
              Oculta em {secondsLeft}s
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() => {
                navigator.clipboard.writeText(pin);
                showToast("success", "PIN copiado");
              }}
            >
              Copiar PIN
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export { PinResetPopover };

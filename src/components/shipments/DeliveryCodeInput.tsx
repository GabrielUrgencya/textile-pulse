"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from "@/components/ui/input-otp";
import { REGEXP_ONLY_DIGITS } from "input-otp";

interface DeliveryCodeInputProps {
  onSubmit: (code: string) => Promise<{ success: boolean; error?: string }>;
  disabled?: boolean;
}

export function DeliveryCodeInput({
  onSubmit,
  disabled,
}: DeliveryCodeInputProps) {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "success" | "blocked">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleComplete = async (code: string) => {
    if (status === "loading" || status === "blocked") return;

    setStatus("loading");
    setErrorMessage("");

    const result = await onSubmit(code);

    if (result.success) {
      setStatus("success");
    } else {
      const isBlocked = result.error?.includes("Muitas tentativas");
      setStatus(isBlocked ? "blocked" : "error");
      setErrorMessage(result.error || "Código inválido");

      if (!isBlocked) {
        // Reset input after shake animation
        setTimeout(() => {
          setValue("");
          setStatus("idle");
        }, 1000);
      }
    }
  };

  const borderClass =
    status === "error"
      ? "ring-2 ring-destructive"
      : status === "success"
        ? "ring-2 ring-green-500"
        : "";

  const shakeClass = status === "error" ? "animate-shake" : "";

  const isError = status === "error" || status === "blocked";

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        role="group"
        aria-label="Código de entrega de 6 dígitos"
        className={`${shakeClass} ${borderClass} rounded-lg p-1 transition-shadow`}
      >
        <InputOTP
          maxLength={6}
          pattern={REGEXP_ONLY_DIGITS}
          value={value}
          onChange={setValue}
          onComplete={handleComplete}
          disabled={disabled || status === "loading" || status === "blocked" || status === "success"}
        >
          <InputOTPGroup>
            <InputOTPSlot index={0} className="h-12 w-12 text-lg" />
            <InputOTPSlot index={1} className="h-12 w-12 text-lg" />
            <InputOTPSlot index={2} className="h-12 w-12 text-lg" />
          </InputOTPGroup>
          <InputOTPSeparator />
          <InputOTPGroup>
            <InputOTPSlot index={3} className="h-12 w-12 text-lg" />
            <InputOTPSlot index={4} className="h-12 w-12 text-lg" />
            <InputOTPSlot index={5} className="h-12 w-12 text-lg" />
          </InputOTPGroup>
        </InputOTP>
      </div>

      {/* Feedback de estado — anunciado por leitores de tela */}
      <div aria-live="polite" className="min-h-[20px] text-center">
        {isError && (
          <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            {errorMessage}
          </p>
        )}
        {status === "success" && (
          <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-success">
            <CheckCircle2 className="size-4 shrink-0" />
            Recebimento confirmado!
          </p>
        )}
        {status === "loading" && (
          <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
            <Loader2 className="size-4 shrink-0 animate-spin" />
            Verificando...
          </p>
        )}
      </div>
    </div>
  );
}

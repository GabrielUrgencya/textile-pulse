"use client";

import { useState } from "react";
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

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-sm font-medium text-muted-foreground">
        Digite o código de entrega para confirmar recebimento
      </p>

      <div className={`${shakeClass} ${borderClass} rounded-lg p-1`}>
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

      {status === "error" && (
        <p className="text-sm font-medium text-destructive">{errorMessage}</p>
      )}
      {status === "blocked" && (
        <p className="text-sm font-medium text-destructive">{errorMessage}</p>
      )}
      {status === "success" && (
        <p className="text-sm font-medium text-green-500">
          Recebimento confirmado!
        </p>
      )}
      {status === "loading" && (
        <p className="text-sm text-muted-foreground">Verificando...</p>
      )}
    </div>
  );
}

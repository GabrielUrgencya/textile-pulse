"use client";

import * as React from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  description?: string;
  consequences?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "destructive" | "warning" | "default";
  loading?: boolean;
  /** Bloqueia o botão de confirmar quando não há nada a fazer (ex.: contagem zero). */
  confirmDisabled?: boolean;
}

function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
  title,
  description,
  consequences,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "default",
  loading = false,
  confirmDisabled = false,
}: ConfirmDialogProps) {
  const confirmVariant =
    variant === "destructive"
      ? "destructive"
      : variant === "warning"
        ? "outline"
        : "default";

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <AlertDialogContent className="sm:max-w-[440px]">
        <AlertDialogHeader>
          <AlertDialogTitle className={cn(
            variant === "destructive" && "text-destructive",
            variant === "warning" && "text-warning",
          )}>
            {title}
          </AlertDialogTitle>
          {description && (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>

        {consequences && consequences.length > 0 && (
          <ul className="space-y-1 text-sm text-muted-foreground px-1">
            {consequences.map((c, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-muted-foreground/60 mt-0.5">•</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        )}

        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onCancel} disabled={loading} className="w-full sm:w-auto">
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            onClick={onConfirm}
            disabled={loading || confirmDisabled}
            className={cn(
              "w-full sm:w-auto",
              variant === "warning" && "border-warning text-warning hover:bg-warning/10",
            )}
          >
            {loading ? "Processando..." : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export { ConfirmDialog };
export type { ConfirmDialogProps };

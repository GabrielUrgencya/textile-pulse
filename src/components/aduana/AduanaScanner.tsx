"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { ScanLine } from "lucide-react";

interface AduanaScannerProps {
  onScan: (barcode: string) => void;
  disabled?: boolean;
  counters: { green: number; amber: number; red: number };
  onFinalize: () => void;
}

export function AduanaScanner({
  onScan,
  disabled,
  counters,
  onFinalize,
}: AduanaScannerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");

  // Auto-focus on mount and after each scan
  useEffect(() => {
    if (!disabled) {
      inputRef.current?.focus();
    }
  }, [disabled]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = value.trim();
      if (trimmed) {
        onScan(trimmed);
        setValue("");
      }
      // Re-focus after scan
      setTimeout(() => inputRef.current?.focus(), 100);
    },
    [value, onScan]
  );

  const total = counters.green + counters.amber + counters.red;

  return (
    <div className="flex flex-col gap-4">
      {/* Scan input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <ScanLine className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Escaneie o código de barras..."
            disabled={disabled}
            autoComplete="off"
            className="w-full rounded-lg border border-input bg-background py-3 pl-10 pr-4 text-2xl font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
        </div>
      </form>

      {/* Counters bar */}
      <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 px-4 py-2">
        <div className="flex gap-6 text-sm">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-green-500" />
            <strong>{counters.green}</strong> OK
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-amber-500" />
            <strong>{counters.amber}</strong> Alerta
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-red-500" />
            <strong>{counters.red}</strong> Bloqueado
          </span>
          <span className="text-muted-foreground">
            Total: <strong>{total}</strong>
          </span>
        </div>

        <button
          onClick={onFinalize}
          disabled={total === 0}
          className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Finalizar
        </button>
      </div>
    </div>
  );
}

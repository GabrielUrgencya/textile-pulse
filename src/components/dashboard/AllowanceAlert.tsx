"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface AllowanceAlertProps {
  className?: string;
}

export function AllowanceAlert({ className }: AllowanceAlertProps) {
  const [data, setData] = useState<{
    allowance_rate: number;
    allowance_target: number;
    threshold_ratio: number;
  } | null>(null);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    fetch(`/api/quality/allowance?from=${today}&to=${today}`)
      .then((r) => r.json())
      .then((res) => setData(res.data || null))
      .catch(() => setData(null));
  }, []);

  // AC6: Don't show if below 80% of threshold
  if (!data || data.threshold_ratio < 0.8) return null;

  const ratePercent = (data.allowance_rate * 100).toFixed(2);
  const targetPercent = (data.allowance_target * 100).toFixed(2);

  // AC5: >100% = destructive, AC4: 80-100% = warning
  const isOver = data.threshold_ratio >= 1;

  return (
    <Alert
      variant={isOver ? "destructive" : "default"}
      className={`lg:col-span-12 ${className || ""}`}
    >
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>
        {isOver ? "Taxa de Perda Excedida" : "Taxa de Perda Elevada"}
      </AlertTitle>
      <AlertDescription className="flex items-center justify-between">
        <span>
          Taxa atual: <strong>{ratePercent}%</strong> (meta: {targetPercent}%)
          — {Math.round(data.threshold_ratio * 100)}% do limite
        </span>
        <a
          href="/quality"
          className="text-xs underline underline-offset-2 hover:text-foreground"
        >
          Ver detalhes →
        </a>
      </AlertDescription>
    </Alert>
  );
}

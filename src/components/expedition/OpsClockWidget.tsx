"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, Truck, Play, Square, LogOut } from "lucide-react";
import {
  type OpsClockRecord,
  getStatus,
  getWaitColor,
  minutesSince,
  formatMinutes,
} from "@/lib/ops-clock";

interface OpsClockWidgetProps {
  records: OpsClockRecord[];
  onAction: (id: string, action: string) => Promise<void>;
}

export function OpsClockWidget({ records, onAction }: OpsClockWidgetProps) {
  const [, setTick] = useState(0);

  // Re-render every 10s to update timers
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(interval);
  }, []);

  const active = records.filter((r) => !r.departed_at);

  if (active.length === 0) {
    return (
      <Card>
        <CardContent className="flex h-40 items-center justify-center">
          <p className="text-sm text-muted-foreground">
            Nenhum motorista na fila
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Truck className="h-4 w-4" />
          Fila de Motoristas ({active.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {active.map((record) => {
          const status = getStatus(record);
          const color = getWaitColor(record);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const driver = record.drivers as any;
          const name = driver?.name || "Motorista";
          const plate = driver?.vehicle_plate || "";
          const mins = minutesSince(record.arrived_at);

          const borderColor =
            color === "red"
              ? "border-red-500"
              : color === "amber"
                ? "border-amber-500"
                : color === "blue"
                  ? "border-blue-500"
                  : "border-border";

          const pulseClass = color === "red" ? "animate-pulse" : "";

          return (
            <div
              key={record.id}
              className={`flex items-center justify-between rounded-lg border-l-4 ${borderColor} ${pulseClass} bg-muted/30 px-3 py-2`}
            >
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">
                    {name}
                    {plate && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {plate}
                      </span>
                    )}
                  </p>
                  <p className="font-mono text-lg font-bold tabular-nums">
                    {formatMinutes(mins)}
                  </p>
                </div>
              </div>

              <div className="flex gap-1">
                {status === "waiting" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onAction(record.id, "start_loading")}
                  >
                    <Play className="mr-1 h-3 w-3" />
                    Carga
                  </Button>
                )}
                {status === "loading" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onAction(record.id, "end_loading")}
                  >
                    <Square className="mr-1 h-3 w-3" />
                    Finalizar
                  </Button>
                )}
                {status === "loaded" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onAction(record.id, "depart")}
                  >
                    <LogOut className="mr-1 h-3 w-3" />
                    Saída
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

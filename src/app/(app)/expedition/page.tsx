"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { OpsClockWidget } from "@/components/expedition/OpsClockWidget";
import { OpsClockMetrics } from "@/components/expedition/OpsClockMetrics";
import type { OpsClockRecord } from "@/lib/ops-clock";

export default function ExpeditionPage() {
  const [records, setRecords] = useState<OpsClockRecord[]>([]);
  const [drivers, setDrivers] = useState<{ id: string; name: string }[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<string>("");
  const [registering, setRegistering] = useState(false);

  const fetchRecords = useCallback(async () => {
    try {
      const res = await fetch("/api/ops-clock?active=true");
      if (res.ok) {
        const json = await res.json();
        setRecords(json.data || []);
      }
    } catch {
      // silently fail
    }
  }, []);

  const fetchDrivers = useCallback(async () => {
    try {
      const res = await fetch("/api/drivers");
      if (res.ok) {
        const json = await res.json();
        setDrivers(json.data || []);
      }
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetchRecords();
    fetchDrivers();
    // Refresh every 15 seconds
    const interval = setInterval(fetchRecords, 15000);
    return () => clearInterval(interval);
  }, [fetchRecords, fetchDrivers]);

  async function handleRegisterArrival() {
    if (!selectedDriver || registering) return;
    setRegistering(true);
    try {
      const res = await fetch("/api/ops-clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId: selectedDriver }),
      });
      if (res.ok) {
        setSelectedDriver("");
        await fetchRecords();
      }
    } catch {
      // silently fail
    } finally {
      setRegistering(false);
    }
  }

  async function handleAction(id: string, action: string) {
    try {
      const res = await fetch(`/api/ops-clock/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        await fetchRecords();
      }
    } catch {
      // silently fail
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Expedição</h1>
          <p className="text-sm text-muted-foreground">
            Controle de tempo de espera dos motoristas
          </p>
        </div>

        {/* Register arrival */}
        <div className="flex items-center gap-2">
          <Select value={selectedDriver} onValueChange={setSelectedDriver}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Selecionar motorista..." />
            </SelectTrigger>
            <SelectContent>
              {drivers.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={handleRegisterArrival}
            disabled={!selectedDriver || registering}
          >
            <Plus className="mr-1 h-4 w-4" />
            Registrar Chegada
          </Button>
        </div>
      </div>

      {/* Metrics */}
      <OpsClockMetrics />

      {/* Active queue */}
      <OpsClockWidget records={records} onAction={handleAction} />
    </div>
  );
}

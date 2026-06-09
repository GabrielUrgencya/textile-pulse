"use client";

import { useState, useCallback } from "react";
import { AduanaScanner } from "@/components/aduana/AduanaScanner";
import {
  AduanaColorFeedback,
  type AduanaColor,
} from "@/components/aduana/AduanaColorFeedback";
import { playSuccess, playWarning, playError } from "@/lib/audio-feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Truck, ScanLine } from "lucide-react";

interface ScanResult {
  color: AduanaColor;
  reason: string;
  barcode: string;
  lot: { id: string; barcode: string; opNumber?: string; productName?: string } | null;
  alertIgnored?: boolean;
  timestamp: string;
}

export default function AduanaPage() {
  // Phase 1: Setup (select shipments)
  const [phase, setPhase] = useState<"setup" | "scanning">("setup");
  const [shipmentIds, setShipmentIds] = useState<string[]>([]);
  const [driverId] = useState<string | undefined>(undefined);
  const [shipmentInput, setShipmentInput] = useState("");

  // Phase 2: Scanning
  const [feedbackColor, setFeedbackColor] = useState<AduanaColor>(null);
  const [feedbackReason, setFeedbackReason] = useState("");
  const [feedbackBarcode, setFeedbackBarcode] = useState("");
  const [scannedBarcodes, setScannedBarcodes] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<ScanResult[]>([]);
  const [counters, setCounters] = useState({ green: 0, amber: 0, red: 0 });
  const [showSummary, setShowSummary] = useState(false);

  const handleAddShipment = () => {
    const id = shipmentInput.trim();
    if (id && !shipmentIds.includes(id)) {
      setShipmentIds((prev) => [...prev, id]);
      setShipmentInput("");
    }
  };

  const handleStartScan = () => {
    if (shipmentIds.length === 0) return;
    setPhase("scanning");
  };

  const handleScan = useCallback(
    async (barcode: string) => {
      // AC5: Check duplicate
      if (scannedBarcodes.has(barcode)) {
        setFeedbackColor("RED");
        setFeedbackReason("Lote já bipado — possível duplicação");
        setFeedbackBarcode(barcode);
        setCounters((c) => ({ ...c, red: c.red + 1 }));
        playError();

        setResults((prev) => [
          ...prev,
          {
            color: "RED",
            reason: "Lote já bipado — possível duplicação",
            barcode,
            lot: null,
            timestamp: new Date().toISOString(),
          },
        ]);
        return;
      }

      try {
        const res = await fetch("/api/aduana/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ barcode, shipmentIds, driverId }),
        });
        const json = await res.json();
        const data = json.data;

        if (data) {
          setFeedbackColor(data.color);
          setFeedbackReason(data.reason);
          setFeedbackBarcode(barcode);

          setScannedBarcodes((prev) => new Set(prev).add(barcode));
          setResults((prev) => [
            ...prev,
            {
              color: data.color,
              reason: data.reason,
              barcode,
              lot: data.lot,
              timestamp: new Date().toISOString(),
            },
          ]);

          if (data.color === "GREEN") {
            setCounters((c) => ({ ...c, green: c.green + 1 }));
            playSuccess();
            // Auto-dismiss green after 1.5s
            setTimeout(() => setFeedbackColor(null), 1500);
          } else if (data.color === "AMBER") {
            setCounters((c) => ({ ...c, amber: c.amber + 1 }));
            playWarning();
          } else {
            setCounters((c) => ({ ...c, red: c.red + 1 }));
            playError();
          }
        }
      } catch {
        setFeedbackColor("RED");
        setFeedbackReason("Erro de conexão");
        setFeedbackBarcode(barcode);
        playError();
      }
    },
    [shipmentIds, driverId, scannedBarcodes]
  );

  // AC6: Proceed with alert (ignore)
  const handleProceed = useCallback(() => {
    // Mark last result as alert ignored
    setResults((prev) => {
      const updated = [...prev];
      if (updated.length > 0) {
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          alertIgnored: true,
        };
      }
      return updated;
    });
    setFeedbackColor(null);
  }, []);

  const handleDismiss = useCallback(() => {
    setFeedbackColor(null);
  }, []);

  // AC7: Summary modal
  const ignoredAlerts = results.filter((r) => r.alertIgnored);

  if (phase === "setup") {
    return (
      <div className="flex min-h-[80vh] items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              Aduana — Conferência de Carga
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                IDs das Remessas
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  type="text"
                  value={shipmentInput}
                  onChange={(e) => setShipmentInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddShipment())}
                  placeholder="Cole o ID da remessa..."
                  className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddShipment}
                >
                  Adicionar
                </Button>
              </div>
              {shipmentIds.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {shipmentIds.map((id) => (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs font-mono"
                    >
                      {id.slice(0, 8)}...
                      <button
                        onClick={() =>
                          setShipmentIds((prev) => prev.filter((s) => s !== id))
                        }
                        className="text-muted-foreground hover:text-foreground"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <Button
              className="w-full"
              disabled={shipmentIds.length === 0}
              onClick={handleStartScan}
            >
              <ScanLine className="mr-2 h-4 w-4" />
              Iniciar Conferência
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Phase 2: Scanning mode (fullscreen)
  return (
    <div className="flex h-screen flex-col p-4">
      {/* Scanner */}
      <AduanaScanner
        onScan={handleScan}
        disabled={!!feedbackColor}
        counters={counters}
        onFinalize={() => setShowSummary(true)}
      />

      {/* Feedback area (60% of screen) */}
      <div className="mt-4 flex-1">
        {feedbackColor ? (
          <AduanaColorFeedback
            color={feedbackColor}
            reason={feedbackReason}
            lotBarcode={feedbackBarcode}
            onDismiss={handleDismiss}
            onProceed={
              feedbackColor === "AMBER" ? handleProceed : undefined
            }
            onSeparate={
              feedbackColor === "AMBER" ? handleDismiss : undefined
            }
          />
        ) : (
          <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-muted-foreground/20">
            <p className="text-lg text-muted-foreground/50">
              Aguardando scan...
            </p>
          </div>
        )}
      </div>

      {/* Summary dialog */}
      <Dialog open={showSummary} onOpenChange={setShowSummary}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Resumo da Conferência</DialogTitle>
            <DialogDescription>
              Total de {counters.green + counters.amber + counters.red} lotes
              verificados
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-4">
              <span className="flex items-center gap-1.5 text-sm">
                <span className="h-3 w-3 rounded-full bg-green-500" />
                <strong>{counters.green}</strong> OK
              </span>
              <span className="flex items-center gap-1.5 text-sm">
                <span className="h-3 w-3 rounded-full bg-amber-500" />
                <strong>{counters.amber}</strong> Alerta
              </span>
              <span className="flex items-center gap-1.5 text-sm">
                <span className="h-3 w-3 rounded-full bg-red-500" />
                <strong>{counters.red}</strong> Bloqueado
              </span>
            </div>

            {ignoredAlerts.length > 0 && (
              <div>
                <p className="text-sm font-medium text-amber-400">
                  Alertas Ignorados ({ignoredAlerts.length}):
                </p>
                <ul className="mt-1 space-y-1">
                  {ignoredAlerts.map((r, i) => (
                    <li key={i} className="text-xs text-muted-foreground">
                      <span className="font-mono">{r.barcode}</span> — {r.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Button
              className="w-full"
              onClick={() => {
                setShowSummary(false);
                setPhase("setup");
                setShipmentIds([]);
                setScannedBarcodes(new Set());
                setResults([]);
                setCounters({ green: 0, amber: 0, red: 0 });
              }}
            >
              Nova Conferência
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

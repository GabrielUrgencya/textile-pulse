"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download } from "lucide-react";
import { showToast } from "@/lib/toast";

interface ExportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExportModal({ open, onOpenChange }: ExportModalProps) {
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [startDate, setStartDate] = useState(thirtyDaysAgo);
  const [endDate, setEndDate] = useState(today);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Preview count on filter change
  useEffect(() => {
    if (!open || !startDate || !endDate) return;

    setLoading(true);
    const controller = new AbortController();

    fetch(
      `/api/export/stock-entries?startDate=${startDate}&endDate=${endDate}&format=json`,
      { signal: controller.signal }
    )
      .then((r) => {
        if (!r.ok) throw new Error("Failed");
        return r.json();
      })
      .then((json) => setPreviewCount(json.total ?? 0))
      .catch(() => setPreviewCount(null))
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [open, startDate, endDate]);

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await fetch(
        `/api/export/stock-entries?startDate=${startDate}&endDate=${endDate}&format=csv`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Erro" }));
        throw new Error(body.error);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lision-export-${startDate}-${endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("success", "Exportação concluída");
      onOpenChange(false);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro na exportação");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Exportar para ERP</DialogTitle>
          <DialogDescription>
            Exporte lotes finalizados em formato CSV para importação no ERP.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Data Início</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Data Fim</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {/* Format info */}
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Formato: CSV (separador ;)</p>
            <p className="text-xs text-muted-foreground mt-1">
              Colunas: data_entrada, op_number, referencia, lote, quantidade_ok, quantidade_defeito, quantidade_descarte
            </p>
          </div>

          {/* Preview count */}
          <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
            <span className="text-sm">Registros encontrados</span>
            <span className="font-mono text-lg font-bold tabular-nums">
              {loading ? "..." : previewCount ?? "—"}
            </span>
          </div>

          {/* Download */}
          <Button
            className="w-full"
            onClick={handleDownload}
            disabled={downloading || previewCount === 0 || previewCount === null}
          >
            <Download className="mr-2 h-4 w-4" />
            {downloading ? "Exportando..." : "Baixar CSV"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

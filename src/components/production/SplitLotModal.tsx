"use client";

import * as React from "react";
import { motion } from "motion/react";
import { X, Plus, Trash2, Loader2, Scissors, Palette } from "lucide-react";
import { LisionCard } from "@/components/ui/lision-card";
import { showToast } from "@/lib/toast";

interface SplitPart {
  quantity: string;
  label: string;
}

interface SplitGridPart {
  sizes: Record<string, string>;
  label: string;
}

interface SplitLotModalProps {
  lotId: string;
  lotNumber: string;
  lotQuantity: number;
  onClose: () => void;
  onSplit: () => void;
  // Story 8.26 — quando o lote tem grade, habilita o modo "fracionar por tamanho"
  lotColor?: string | null;
  lotSizeGrid?: Record<string, number> | null;
}

/** Story 8.15 + 8.26 — Modal de fracionamento manual de lote */
function SplitLotModal({
  lotId,
  lotNumber,
  lotQuantity,
  onClose,
  onSplit,
  lotColor,
  lotSizeGrid,
}: SplitLotModalProps) {
  const sizes = React.useMemo(
    () =>
      lotSizeGrid
        ? Object.keys(lotSizeGrid).filter((s) => (lotSizeGrid[s] || 0) > 0)
        : [],
    [lotSizeGrid],
  );
  const gridMode = sizes.length > 0;

  if (gridMode) {
    return (
      <GridSplit
        lotId={lotId}
        lotNumber={lotNumber}
        lotColor={lotColor}
        sizes={sizes}
        grid={lotSizeGrid as Record<string, number>}
        onClose={onClose}
        onSplit={onSplit}
      />
    );
  }

  return (
    <LegacySplit
      lotId={lotId}
      lotNumber={lotNumber}
      lotQuantity={lotQuantity}
      onClose={onClose}
      onSplit={onSplit}
    />
  );
}

/* ───────────────────────── Modo GRADE (8.26) ───────────────────────── */

function GridSplit({
  lotId,
  lotNumber,
  lotColor,
  sizes,
  grid,
  onClose,
  onSplit,
}: {
  lotId: string;
  lotNumber: string;
  lotColor?: string | null;
  sizes: string[];
  grid: Record<string, number>;
  onClose: () => void;
  onSplit: () => void;
}) {
  const emptyPart = (): SplitGridPart => ({
    sizes: Object.fromEntries(sizes.map((s) => [s, ""])),
    label: "",
  });
  const [parts, setParts] = React.useState<SplitGridPart[]>([emptyPart()]);
  const [saving, setSaving] = React.useState(false);

  const num = (v: string) => parseInt(v) || 0;

  // Retirado por tamanho e restante por tamanho na mãe
  const pulled: Record<string, number> = {};
  for (const s of sizes) pulled[s] = parts.reduce((acc, p) => acc + num(p.sizes[s]), 0);
  const remaining: Record<string, number> = {};
  for (const s of sizes) remaining[s] = (grid[s] || 0) - pulled[s];

  const exceeded = sizes.some((s) => remaining[s] < 0);
  const totalPulled = sizes.reduce((acc, s) => acc + pulled[s], 0);
  const partsValid = parts.every((p) => sizes.reduce((a, s) => a + num(p.sizes[s]), 0) >= 1);
  const valid = totalPulled > 0 && !exceeded && partsValid;

  function updateSize(i: number, size: string, value: string) {
    setParts((prev) =>
      prev.map((p, idx) =>
        idx === i ? { ...p, sizes: { ...p.sizes, [size]: value } } : p,
      ),
    );
  }
  function updateLabel(i: number, value: string) {
    setParts((prev) => prev.map((p, idx) => (idx === i ? { ...p, label: value } : p)));
  }
  function addPart() {
    setParts((prev) => [...prev, emptyPart()]);
  }
  function removePart(i: number) {
    setParts((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  async function handleSubmit() {
    if (!valid) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/production/lots/${lotId}/split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parts: parts.map((p) => ({
            sizes: Object.fromEntries(
              sizes.map((s) => [s, num(p.sizes[s])]).filter(([, q]) => (q as number) > 0),
            ),
            label: p.label.trim() || null,
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erro ao fracionar lote");
      }
      showToast("success", "Lote fracionado por tamanho com sucesso");
      onSplit();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao fracionar lote");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Shell onClose={onClose} title={`${lotNumber} — fracionar por tamanho`} wide>
      {lotColor && (
        <div className="flex items-center gap-1.5 text-[12px] font-semibold mb-3">
          <Palette className="size-3.5 text-muted-foreground" />
          {lotColor}
          <span className="text-muted-foreground font-normal">(cor herdada pelos lotes filhos)</span>
        </div>
      )}

      {/* Disponível por tamanho */}
      <div className="flex flex-wrap gap-2 text-[11px] mb-3">
        {sizes.map((s) => (
          <span
            key={s}
            className="px-2 py-1 rounded-md bg-secondary/40 border border-border/40 font-mono tabular-nums"
          >
            {s}: <span className="text-muted-foreground">{grid[s] || 0}</span>
          </span>
        ))}
      </div>

      <div className="space-y-2 max-h-[300px] overflow-y-auto mb-3">
        {parts.map((p, i) => (
          <div key={i} className="p-2.5 rounded-lg bg-secondary/30 border border-border/40 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-mono font-bold text-muted-foreground w-12">
                Lote {i + 1}
              </span>
              {sizes.map((s) => (
                <label key={s} className="flex items-center gap-1 text-[11px]">
                  <span className="text-muted-foreground">{s}</span>
                  <input
                    type="number"
                    min={0}
                    max={grid[s] || 0}
                    className="w-12 text-center input-field !h-7 !px-1 tabular-nums"
                    placeholder="0"
                    value={p.sizes[s]}
                    onChange={(e) => updateSize(i, s, e.target.value)}
                    disabled={saving}
                  />
                </label>
              ))}
              <span className="text-[11px] font-mono tabular-nums ml-auto">
                = {sizes.reduce((a, s) => a + num(p.sizes[s]), 0)} pç
              </span>
              <button
                onClick={() => removePart(i)}
                disabled={parts.length === 1 || saving}
                className="p-1.5 rounded-md hover:bg-secondary text-destructive disabled:opacity-30"
                title="Remover parte"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
            <input
              className="input-field !h-8"
              placeholder="Rótulo / modelo (opcional)"
              value={p.label}
              onChange={(e) => updateLabel(i, e.target.value)}
              disabled={saving}
            />
          </div>
        ))}
      </div>

      <button
        onClick={addPart}
        disabled={saving}
        className="text-[12px] flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition mb-4"
      >
        <Plus className="size-3.5" /> Adicionar parte
      </button>

      {/* Restante por tamanho na mãe */}
      <div className="text-[12px] py-2 px-3 rounded-lg bg-secondary/30 border border-border/40 mb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-muted-foreground">Restante no lote-mãe (por tamanho)</span>
          <span className="font-mono tabular-nums">
            {sizes.reduce((a, s) => a + Math.max(0, remaining[s]), 0)} pç
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {sizes.map((s) => (
            <span
              key={s}
              className={`font-mono text-[11px] tabular-nums ${
                remaining[s] < 0 ? "text-destructive" : "text-muted-foreground"
              }`}
            >
              {s}: {remaining[s]}
            </span>
          ))}
        </div>
      </div>

      {exceeded && (
        <p className="text-[11px] text-destructive mb-3">
          Algum tamanho ultrapassou o disponível na grade da mãe.
        </p>
      )}

      <Actions onClose={onClose} onSubmit={handleSubmit} valid={valid} saving={saving} />
    </Shell>
  );
}

/* ───────────────────────── Modo LEGADO (8.15) ───────────────────────── */

function LegacySplit({
  lotId,
  lotNumber,
  lotQuantity,
  onClose,
  onSplit,
}: {
  lotId: string;
  lotNumber: string;
  lotQuantity: number;
  onClose: () => void;
  onSplit: () => void;
}) {
  const [parts, setParts] = React.useState<SplitPart[]>([{ quantity: "", label: "" }]);
  const [saving, setSaving] = React.useState(false);

  const sum = parts.reduce((acc, p) => acc + (parseInt(p.quantity) || 0), 0);
  const remainder = lotQuantity - sum;
  const valid =
    sum > 0 && sum <= lotQuantity && parts.every((p) => (parseInt(p.quantity) || 0) >= 1);

  function updatePart(i: number, key: keyof SplitPart, value: string) {
    setParts((prev) => prev.map((p, idx) => (idx === i ? { ...p, [key]: value } : p)));
  }
  function addPart() {
    setParts((prev) => [...prev, { quantity: "", label: "" }]);
  }
  function removePart(i: number) {
    setParts((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  async function handleSubmit() {
    if (!valid) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/production/lots/${lotId}/split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parts: parts.map((p) => ({
            quantity: parseInt(p.quantity),
            label: p.label.trim() || null,
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erro ao fracionar lote");
      }
      showToast("success", "Lote fracionado com sucesso");
      onSplit();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao fracionar lote");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Shell onClose={onClose} title={`${lotNumber} — ${lotQuantity.toLocaleString("pt-BR")} peças`}>
      <div className="space-y-2 max-h-[320px] overflow-y-auto mb-3">
        {parts.map((p, i) => (
          <div key={i} className="grid grid-cols-[110px_1fr_auto] gap-2 items-center">
            <input
              type="number"
              min={1}
              className="input-field tabular-nums"
              placeholder="Qtd"
              value={p.quantity}
              onChange={(e) => updatePart(i, "quantity", e.target.value)}
              disabled={saving}
            />
            <input
              className="input-field"
              placeholder="Cor / tamanho / modelo (opcional)"
              value={p.label}
              onChange={(e) => updatePart(i, "label", e.target.value)}
              disabled={saving}
            />
            <button
              onClick={() => removePart(i)}
              disabled={parts.length === 1 || saving}
              className="p-2 rounded-md hover:bg-secondary text-destructive disabled:opacity-30"
              title="Remover parte"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={addPart}
        disabled={saving}
        className="text-[12px] flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition mb-4"
      >
        <Plus className="size-3.5" /> Adicionar parte
      </button>

      <div className="flex items-center justify-between text-[12px] py-2 px-3 rounded-lg bg-secondary/30 border border-border/40 mb-4">
        <span className="text-muted-foreground">
          Somado: <span className="font-mono tabular-nums text-foreground">{sum}</span> / {lotQuantity}
        </span>
        <span className={remainder < 0 ? "text-destructive" : "text-muted-foreground"}>
          Restante no lote-mãe:{" "}
          <span className="font-mono tabular-nums text-foreground">{remainder}</span>
        </span>
      </div>

      {remainder < 0 && (
        <p className="text-[11px] text-destructive mb-3">
          A soma das partes excede a quantidade do lote.
        </p>
      )}

      <Actions onClose={onClose} onSubmit={handleSubmit} valid={valid} saving={saving} />
    </Shell>
  );
}

/* ───────────────────────── UI compartilhada ───────────────────────── */

function Shell({
  title,
  wide,
  onClose,
  children,
}: {
  title: string;
  wide?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        className={wide ? "w-full max-w-2xl" : "w-full max-w-lg"}
      >
        <LisionCard>
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80 mb-1.5 font-medium flex items-center gap-1.5">
                <Scissors className="size-3" /> Fracionar Lote
              </div>
              <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
            </div>
            <button
              onClick={onClose}
              className="size-8 rounded-lg bg-secondary/60 border border-border/60 grid place-items-center hover:bg-secondary transition"
            >
              <X className="size-4" />
            </button>
          </div>
          {children}
        </LisionCard>
      </motion.div>
    </motion.div>
  );
}

function Actions({
  onClose,
  onSubmit,
  valid,
  saving,
}: {
  onClose: () => void;
  onSubmit: () => void;
  valid: boolean;
  saving: boolean;
}) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <button
        onClick={onSubmit}
        disabled={!valid || saving}
        className="flex-1 h-9 rounded-lg bg-foreground text-background text-[13px] font-medium hover:bg-foreground/90 transition flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {saving ? <Loader2 className="size-4 animate-spin" /> : <Scissors className="size-4" />}
        Fracionar
      </button>
      <button
        onClick={onClose}
        disabled={saving}
        className="h-9 px-4 rounded-lg bg-secondary/60 border border-border/60 text-[13px] font-medium hover:bg-secondary transition text-muted-foreground"
      >
        Cancelar
      </button>
    </div>
  );
}

export { SplitLotModal };

"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ArrowLeft, Loader2, Package, AlertTriangle } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { LisionCard, LisionCardHeader } from "@/components/ui/lision-card";
import { useServerData } from "@/hooks/use-server-data";
import { GridLotBuilder, type GridLotState } from "@/components/production/GridLotBuilder";

interface ReferenceTarget {
  id: string;
  reference: string;
  meta_coefficient: number;
  description: string | null;
}

/* ────────────── Helpers ────────────── */

function generateOpNumber(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const seq = String(Math.floor(Math.random() * 900) + 100);
  return `${y}${m}${d}-${seq}`;
}

/* ────────────── Page ────────────── */

export default function NewProductionOrderPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lotProgress, setLotProgress] = useState({ current: 0, total: 0 });

  /* Form state */
  const [productName, setProductName] = useState("");
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("0");
  const [notes, setNotes] = useState("");
  const [metaCoefficient, setMetaCoefficient] = useState("1");
  const [coefAutoFilled, setCoefAutoFilled] = useState(false);

  /* Story 8.25 — grade cor×tamanho + divisão manual de lotes */
  const [grid, setGrid] = useState<GridLotState>({ totalQuantity: 0, lots: [], valid: false });
  const handleGridChange = useCallback((s: GridLotState) => setGrid(s), []);

  /* Story 8.13 — referências cadastradas para autofill do coeficiente */
  const { data: references } =
    useServerData<ReferenceTarget[]>("/api/settings/references");

  function handleReferenceChange(value: string) {
    setReference(value);
    const match = (references || []).find(
      (r) => r.reference.toLowerCase() === value.trim().toLowerCase(),
    );
    if (match) {
      setMetaCoefficient(String(match.meta_coefficient));
      setCoefAutoFilled(true);
    } else {
      setCoefAutoFilled(false);
    }
  }

  const canSubmit = !!productName && grid.totalQuantity > 0 && grid.valid;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!productName) { setError("Informe o produto"); return; }
    if (grid.totalQuantity <= 0) { setError("Preencha a grade de cores/tamanhos"); return; }
    if (!grid.valid) { setError("Ajuste a divisão dos lotes — a soma deve bater com a grade"); return; }

    setLoading(true);
    setError("");
    const opNumber = generateOpNumber();

    try {
      /* 1. Cria a OP (total derivado da grade) */
      const res = await fetch("/api/production/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op_number: opNumber,
          product_name: productName,
          reference: reference || null,
          description: description || null,
          total_quantity: grid.totalQuantity,
          meta_coefficient: Number(metaCoefficient) || 1.0,
          priority: parseInt(priority),
          notes: notes || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Erro ao criar OP");
        return;
      }

      const { order } = await res.json();

      /* 2. Cria os lotes definidos manualmente (com cor + grade de tamanhos) */
      setLotProgress({ current: 0, total: grid.lots.length });

      for (let i = 0; i < grid.lots.length; i++) {
        const lot = grid.lots[i];
        setLotProgress({ current: i + 1, total: grid.lots.length });

        const lotRes = await fetch(`/api/production/orders/${order.id}/lots`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quantity: lot.quantity,
            color: lot.color || null,
            size_grid: lot.sizeGrid,
          }),
        });

        if (!lotRes.ok) {
          const data = await lotRes.json().catch(() => null);
          setError(
            `Erro ao criar lote ${i + 1}${data?.error ? ` (${data.error})` : ""}. OP criada parcialmente.`,
          );
          router.push(`/production/orders/${order.id}`);
          return;
        }
      }

      router.push(`/production/orders/${order.id}`);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-6 lg:py-8">
      <PageHeader eyebrow="Ordens de Produção" title="Nova OP">
        <button
          onClick={() => router.back()}
          className="h-9 px-4 rounded-lg bg-secondary/60 border border-border/60 text-[13px] font-medium hover:bg-secondary transition flex items-center gap-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Voltar
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Form */}
        <motion.div
          className="lg:col-span-8"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <LisionCard>
            <LisionCardHeader eyebrow="Cadastro" title="Dados da Ordem de Produção" />

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Product + Reference */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Produto" required>
                  <input
                    type="text"
                    required
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="Ex: Conjunto 9000"
                    disabled={loading}
                    className="input-field"
                  />
                </Field>
                <Field label="Referência">
                  <input
                    type="text"
                    list="references-list"
                    value={reference}
                    onChange={(e) => handleReferenceChange(e.target.value)}
                    placeholder="Ex: 1006"
                    disabled={loading}
                    className="input-field"
                  />
                  <datalist id="references-list">
                    {(references || []).map((r) => (
                      <option key={r.id} value={r.reference}>
                        coef {r.meta_coefficient}
                        {r.description ? ` — ${r.description}` : ""}
                      </option>
                    ))}
                  </datalist>
                </Field>
              </div>

              {/* Meta coefficient (Story 8.13) */}
              <Field label="Coeficiente de Meta (peso da referência)">
                <input
                  type="number"
                  step="0.01"
                  min={0.01}
                  value={metaCoefficient}
                  onChange={(e) => {
                    setMetaCoefficient(e.target.value);
                    setCoefAutoFilled(false);
                  }}
                  disabled={loading}
                  className="input-field tabular-nums"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  {coefAutoFilled
                    ? "✓ Preenchido automaticamente pela referência cadastrada (editável)"
                    : "Padrão 1.0. Cadastre referências em Configurações → Referências para preencher automaticamente."}
                </p>
              </Field>

              {/* Description */}
              <Field label="Descrição">
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Detalhes adicionais da OP"
                  disabled={loading}
                  className="input-field"
                />
              </Field>

              {/* Grade cor×tamanho + divisão manual de lotes (Story 8.25) */}
              <div className="pt-2 border-t border-border/40">
                <GridLotBuilder onChange={handleGridChange} disabled={loading} />
              </div>

              {/* Priority + Notes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-border/40">
                <Field label="Prioridade">
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    disabled={loading}
                    className="input-field appearance-none cursor-pointer"
                  >
                    <option value="0">Normal</option>
                    <option value="1">Alta</option>
                    <option value="2">Urgente</option>
                  </select>
                </Field>
                <Field label="Observações">
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Notas internas"
                    disabled={loading}
                    className="input-field"
                  />
                </Field>
              </div>

              {/* Error */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-2.5 text-[12px] py-2 px-3 rounded-md bg-destructive/10 border border-destructive/20"
                >
                  <AlertTriangle className="size-3.5 mt-0.5 text-destructive shrink-0" />
                  <span className="text-foreground/80">{error}</span>
                </motion.div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || !canSubmit}
                className="w-full h-10 rounded-lg bg-foreground text-background text-[13px] font-semibold hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {lotProgress.total > 0
                      ? `Criando lote ${lotProgress.current}/${lotProgress.total}...`
                      : "Criando OP..."}
                  </>
                ) : (
                  "Criar Ordem de Produção"
                )}
              </button>
            </form>
          </LisionCard>
        </motion.div>

        {/* Preview sidebar */}
        <motion.div
          className="lg:col-span-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        >
          <LisionCard>
            <LisionCardHeader eyebrow="Preview" title="Lotes" />

            {grid.lots.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-[13px]">
                  <Package className="size-4 text-muted-foreground" />
                  <span>
                    <span className="font-display text-[22px] font-semibold tabular-nums">
                      {grid.lots.length}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      {grid.lots.length === 1 ? "lote" : "lotes"}
                    </span>
                  </span>
                </div>

                <div className="space-y-1.5">
                  {grid.lots.slice(0, 10).map((lot, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary/30 border border-border/40"
                    >
                      <div className="size-7 rounded-md bg-foreground text-background grid place-items-center text-[10px] font-mono font-bold shrink-0">
                        L{String(i + 1).padStart(2, "0")}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-medium truncate">
                          {lot.color || "—"}
                        </div>
                        <div className="font-mono text-[10px] text-muted-foreground truncate">
                          {Object.entries(lot.sizeGrid)
                            .map(([s, q]) => `${s}:${q}`)
                            .join("  ") || "—"}
                        </div>
                      </div>
                      <div className="font-mono text-[12px] tabular-nums">
                        {lot.quantity.toLocaleString("pt-BR")} pç
                      </div>
                    </div>
                  ))}
                  {grid.lots.length > 10 && (
                    <div className="text-center text-[11px] text-muted-foreground py-1">
                      +{grid.lots.length - 10} lotes adicionais
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-border/40 text-[11px] text-muted-foreground">
                  Total: {grid.totalQuantity.toLocaleString("pt-BR")} peças em {grid.lots.length} lotes
                  {!grid.valid && (
                    <span className="block text-amber-600 mt-1">
                      ⚠ Ajuste a divisão antes de criar.
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-[13px] text-muted-foreground">
                Preencha a grade de cores e tamanhos para visualizar os lotes
              </div>
            )}
          </LisionCard>
        </motion.div>
      </div>
    </div>
  );
}

/* ── Shared field wrapper ── */

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1.5">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

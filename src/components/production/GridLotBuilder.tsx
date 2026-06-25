"use client";

import * as React from "react";
import { Plus, Trash2, Wand2, Palette, Grid3x3, AlertTriangle, CheckCircle2 } from "lucide-react";

/**
 * Story 8.25 — Editor de grade (cor × tamanho) + construtor MANUAL de lotes.
 *
 * Substitui a divisão automática rígida (Math.ceil → N lotes iguais).
 * A Karen monta a grade por cor, o sistema SUGERE 1 lote por cor, e ela EDITA
 * livremente os lotes (adiciona, remove, muda quantidades/tamanhos). A conservação
 * de peças (soma dos lotes = grade) é validada em tempo real.
 */

export interface BuiltLot {
  color: string;
  sizeGrid: Record<string, number>;
  quantity: number;
}

export interface GridLotState {
  totalQuantity: number;
  lots: BuiltLot[];
  valid: boolean;
}

interface ColorRow {
  id: number;
  name: string;
  sizes: Record<string, number>;
}

interface LotRow {
  id: number;
  colorId: number;
  sizes: Record<string, number>;
}

const DEFAULT_SIZES = ["P", "M", "G", "GG"];

let _seq = 0;
const nextId = () => ++_seq;

function emptySizes(sizes: string[]): Record<string, number> {
  return Object.fromEntries(sizes.map((s) => [s, 0]));
}

function sumSizes(grid: Record<string, number>): number {
  return Object.values(grid).reduce((a, b) => a + (Number(b) || 0), 0);
}

export function GridLotBuilder({
  onChange,
  disabled,
}: {
  onChange: (state: GridLotState) => void;
  disabled?: boolean;
}) {
  const [sizes, setSizes] = React.useState<string[]>(DEFAULT_SIZES);
  const [colors, setColors] = React.useState<ColorRow[]>([
    { id: nextId(), name: "", sizes: emptySizes(DEFAULT_SIZES) },
  ]);
  const [lots, setLots] = React.useState<LotRow[]>([]);
  const [touchedLots, setTouchedLots] = React.useState(false);

  /* ───────── Sugestão automática: 1 lote por cor (com grade completa) ───────── */
  const buildSuggestion = React.useCallback(
    (cols: ColorRow[]): LotRow[] =>
      cols
        .filter((c) => c.name.trim() && sumSizes(c.sizes) > 0)
        .map((c) => ({ id: nextId(), colorId: c.id, sizes: { ...c.sizes } })),
    [],
  );

  /* Enquanto a usuária não mexeu manualmente nos lotes, mantém a sugestão sincronizada com a grade */
  React.useEffect(() => {
    if (!touchedLots) {
      setLots(buildSuggestion(colors));
    }
  }, [colors, touchedLots, buildSuggestion]);

  /* ───────── Cálculos de validação (conservação por cor × tamanho) ───────── */
  const validation = React.useMemo(() => {
    const namedColors = colors.filter((c) => c.name.trim() && sumSizes(c.sizes) > 0);
    const grandTotal = namedColors.reduce((acc, c) => acc + sumSizes(c.sizes), 0);

    // Alocado por cor × tamanho (a partir dos lotes)
    const allocated = new Map<number, Record<string, number>>();
    for (const lot of lots) {
      const cur = allocated.get(lot.colorId) ?? emptySizes(sizes);
      for (const s of sizes) cur[s] = (cur[s] || 0) + (Number(lot.sizes[s]) || 0);
      allocated.set(lot.colorId, cur);
    }

    const colorIssues: { name: string; size: string; grade: number; alloc: number }[] = [];
    for (const c of namedColors) {
      const alloc = allocated.get(c.id) ?? emptySizes(sizes);
      for (const s of sizes) {
        const g = Number(c.sizes[s]) || 0;
        const a = Number(alloc[s]) || 0;
        if (g !== a) colorIssues.push({ name: c.name, size: s, grade: g, alloc: a });
      }
    }

    const lotsWithoutQty = lots.filter((l) => sumSizes(l.sizes) <= 0).length;
    const lotsTotal = lots.reduce((acc, l) => acc + sumSizes(l.sizes), 0);

    const valid =
      grandTotal > 0 &&
      lots.length > 0 &&
      lotsWithoutQty === 0 &&
      colorIssues.length === 0 &&
      lotsTotal === grandTotal;

    return { grandTotal, colorIssues, lotsWithoutQty, lotsTotal, valid, namedColors };
  }, [colors, lots, sizes]);

  /* ───────── Propaga estado para o pai ───────── */
  React.useEffect(() => {
    const colorName = (id: number) => colors.find((c) => c.id === id)?.name.trim() || "";
    const built: BuiltLot[] = lots.map((l) => {
      const grid = Object.fromEntries(
        sizes.map((s) => [s, Number(l.sizes[s]) || 0]).filter(([, q]) => (q as number) > 0),
      ) as Record<string, number>;
      return { color: colorName(l.colorId), sizeGrid: grid, quantity: sumSizes(l.sizes) };
    });
    onChange({ totalQuantity: validation.grandTotal, lots: built, valid: validation.valid });
  }, [lots, colors, sizes, validation, onChange]);

  /* ───────── Handlers: tamanhos (colunas) ───────── */
  function addSize() {
    const base = "T" + (sizes.length + 1);
    let name = base;
    let i = 1;
    while (sizes.includes(name)) name = base + "_" + i++;
    setSizes((p) => [...p, name]);
    setColors((p) => p.map((c) => ({ ...c, sizes: { ...c.sizes, [name]: 0 } })));
    setLots((p) => p.map((l) => ({ ...l, sizes: { ...l.sizes, [name]: 0 } })));
  }
  function renameSize(idx: number, value: string) {
    const old = sizes[idx];
    const v = value.trim();
    if (!v || sizes.includes(v)) {
      setSizes((p) => p.map((s, i) => (i === idx ? value : s)));
      return;
    }
    setSizes((p) => p.map((s, i) => (i === idx ? v : s)));
    const remap = (grid: Record<string, number>) => {
      const { [old]: oldVal, ...rest } = grid;
      return { ...rest, [v]: oldVal ?? 0 };
    };
    setColors((p) => p.map((c) => ({ ...c, sizes: remap(c.sizes) })));
    setLots((p) => p.map((l) => ({ ...l, sizes: remap(l.sizes) })));
  }
  function removeSize(idx: number) {
    if (sizes.length <= 1) return;
    const target = sizes[idx];
    setSizes((p) => p.filter((_, i) => i !== idx));
    const strip = (grid: Record<string, number>) => {
      const rest = { ...grid };
      delete rest[target];
      return rest;
    };
    setColors((p) => p.map((c) => ({ ...c, sizes: strip(c.sizes) })));
    setLots((p) => p.map((l) => ({ ...l, sizes: strip(l.sizes) })));
  }

  /* ───────── Handlers: cores (grade) ───────── */
  function addColor() {
    setColors((p) => [...p, { id: nextId(), name: "", sizes: emptySizes(sizes) }]);
  }
  function updateColorName(id: number, name: string) {
    setColors((p) => p.map((c) => (c.id === id ? { ...c, name } : c)));
  }
  function updateColorSize(id: number, size: string, value: string) {
    const qty = Math.max(0, Math.trunc(Number(value) || 0));
    setColors((p) => p.map((c) => (c.id === id ? { ...c, sizes: { ...c.sizes, [size]: qty } } : c)));
  }
  function removeColor(id: number) {
    setColors((p) => (p.length <= 1 ? p : p.filter((c) => c.id !== id)));
    setLots((p) => p.filter((l) => l.colorId !== id));
  }

  /* ───────── Handlers: lotes (divisão manual) ───────── */
  function resuggest() {
    setLots(buildSuggestion(colors));
    setTouchedLots(false);
  }
  function addLotForColor(colorId: number) {
    setTouchedLots(true);
    setLots((p) => [...p, { id: nextId(), colorId, sizes: emptySizes(sizes) }]);
  }
  function updateLotSize(id: number, size: string, value: string) {
    setTouchedLots(true);
    const qty = Math.max(0, Math.trunc(Number(value) || 0));
    setLots((p) => p.map((l) => (l.id === id ? { ...l, sizes: { ...l.sizes, [size]: qty } } : l)));
  }
  function removeLot(id: number) {
    setTouchedLots(true);
    setLots((p) => p.filter((l) => l.id !== id));
  }

  /* ───────── Render ───────── */
  return (
    <div className="space-y-6">
      {/* GRADE cor × tamanho */}
      <section className="space-y-3">
        <Header icon={<Grid3x3 className="size-4" />} title="Grade (cor × tamanho)" />
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-medium pb-2 pr-3">
                  Cor
                </th>
                {sizes.map((s, i) => (
                  <th key={i} className="pb-2 px-1">
                    <input
                      value={s}
                      onChange={(e) => renameSize(i, e.target.value)}
                      disabled={disabled}
                      className="w-12 text-center input-field !h-7 !px-1 text-[12px] font-semibold"
                      aria-label={`Tamanho ${i + 1}`}
                    />
                    {sizes.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSize(i)}
                        disabled={disabled}
                        className="block mx-auto mt-0.5 text-muted-foreground/60 hover:text-destructive transition"
                        title="Remover tamanho"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    )}
                  </th>
                ))}
                <th className="pb-2 pl-2">
                  <button
                    type="button"
                    onClick={addSize}
                    disabled={disabled}
                    className="size-7 rounded-md bg-secondary/60 border border-border/60 grid place-items-center hover:bg-secondary transition"
                    title="Adicionar tamanho"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </th>
                <th className="pb-2 pl-3 text-right text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                  Total
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              {colors.map((c) => (
                <tr key={c.id}>
                  <td className="pr-3 py-1">
                    <div className="flex items-center gap-2">
                      <Palette className="size-3.5 text-muted-foreground shrink-0" />
                      <input
                        value={c.name}
                        onChange={(e) => updateColorName(c.id, e.target.value)}
                        placeholder="Ex: Preto"
                        disabled={disabled}
                        className="input-field !h-8 w-32"
                      />
                    </div>
                  </td>
                  {sizes.map((s) => (
                    <td key={s} className="px-1 py-1">
                      <input
                        type="number"
                        min={0}
                        value={c.sizes[s] || ""}
                        onChange={(e) => updateColorSize(c.id, s, e.target.value)}
                        placeholder="0"
                        disabled={disabled}
                        className="w-12 text-center input-field !h-8 !px-1 tabular-nums"
                      />
                    </td>
                  ))}
                  <td className="pl-2" />
                  <td className="pl-3 text-right font-mono tabular-nums text-[13px]">
                    {sumSizes(c.sizes).toLocaleString("pt-BR")}
                  </td>
                  <td className="pl-2">
                    {colors.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeColor(c.id)}
                        disabled={disabled}
                        className="text-muted-foreground/60 hover:text-destructive transition"
                        title="Remover cor"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={addColor}
            disabled={disabled}
            className="h-8 px-3 rounded-lg bg-secondary/60 border border-border/60 text-[12px] font-medium hover:bg-secondary transition flex items-center gap-1.5"
          >
            <Plus className="size-3.5" /> Adicionar cor
          </button>
          <div className="text-[12px] text-muted-foreground">
            Total da OP:{" "}
            <span className="font-display text-[16px] font-semibold tabular-nums text-foreground">
              {validation.grandTotal.toLocaleString("pt-BR")}
            </span>{" "}
            peças
          </div>
        </div>
      </section>

      {/* DIVISÃO MANUAL de lotes */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <Header icon={<Grid3x3 className="size-4" />} title="Lotes (divisão manual)" />
          <button
            type="button"
            onClick={resuggest}
            disabled={disabled || validation.grandTotal === 0}
            className="h-8 px-3 rounded-lg bg-secondary/60 border border-border/60 text-[12px] font-medium hover:bg-secondary transition flex items-center gap-1.5 disabled:opacity-50"
            title="Sugerir 1 lote por cor (você pode editar depois)"
          >
            <Wand2 className="size-3.5" /> Sugerir divisão
          </button>
        </div>

        {validation.grandTotal === 0 ? (
          <p className="text-[13px] text-muted-foreground py-4 text-center">
            Preencha a grade acima para montar os lotes.
          </p>
        ) : (
          <>
            {/* agrupa lotes por cor para edição clara */}
            {validation.namedColors.map((c) => {
              const colorLots = lots.filter((l) => l.colorId === c.id);
              return (
                <div key={c.id} className="rounded-xl border border-border/50 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold flex items-center gap-1.5">
                      <Palette className="size-3.5 text-muted-foreground" />
                      {c.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => addLotForColor(c.id)}
                      disabled={disabled}
                      className="h-7 px-2.5 rounded-md bg-secondary/60 border border-border/60 text-[11px] font-medium hover:bg-secondary transition flex items-center gap-1"
                    >
                      <Plus className="size-3" /> Lote
                    </button>
                  </div>

                  {colorLots.length === 0 && (
                    <p className="text-[11px] text-destructive">
                      Sem lotes para esta cor — adicione ao menos um.
                    </p>
                  )}

                  {colorLots.map((lot, idx) => (
                    <div
                      key={lot.id}
                      className="flex items-center gap-2 flex-wrap p-2 rounded-lg bg-secondary/30 border border-border/40"
                    >
                      <span className="text-[10px] font-mono font-bold text-muted-foreground w-12 shrink-0">
                        Lote {idx + 1}
                      </span>
                      {sizes.map((s) => (
                        <label key={s} className="flex items-center gap-1 text-[11px]">
                          <span className="text-muted-foreground">{s}</span>
                          <input
                            type="number"
                            min={0}
                            value={lot.sizes[s] || ""}
                            onChange={(e) => updateLotSize(lot.id, s, e.target.value)}
                            placeholder="0"
                            disabled={disabled}
                            className="w-12 text-center input-field !h-7 !px-1 tabular-nums"
                          />
                        </label>
                      ))}
                      <span className="text-[11px] font-mono tabular-nums ml-auto">
                        = {sumSizes(lot.sizes).toLocaleString("pt-BR")} pç
                      </span>
                      <button
                        type="button"
                        onClick={() => removeLot(lot.id)}
                        disabled={disabled}
                        className="text-muted-foreground/60 hover:text-destructive transition"
                        title="Remover lote"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}

                  {/* restante por tamanho desta cor */}
                  <ColorRemainder color={c} colorLots={colorLots} sizes={sizes} />
                </div>
              );
            })}

            {/* Painel de validação / conservação */}
            <div
              className={`flex items-start gap-2.5 text-[12px] py-2.5 px-3 rounded-lg border ${
                validation.valid
                  ? "bg-emerald-500/10 border-emerald-500/20"
                  : "bg-amber-500/10 border-amber-500/20"
              }`}
            >
              {validation.valid ? (
                <CheckCircle2 className="size-4 mt-0.5 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="size-4 mt-0.5 text-amber-600 shrink-0" />
              )}
              <div className="space-y-0.5">
                {validation.valid ? (
                  <span className="text-foreground/80">
                    Conservação OK — {lots.length} lote(s), {validation.lotsTotal.toLocaleString("pt-BR")} peças
                    distribuídas corretamente.
                  </span>
                ) : (
                  <>
                    <span className="text-foreground/80 font-medium">
                      Ajuste a divisão: a soma dos lotes deve bater com a grade.
                    </span>
                    {validation.colorIssues.slice(0, 6).map((it, i) => (
                      <div key={i} className="text-foreground/70">
                        {it.name} · {it.size}: grade {it.grade} ≠ lotes {it.alloc}
                      </div>
                    ))}
                    {validation.lotsWithoutQty > 0 && (
                      <div className="text-foreground/70">
                        {validation.lotsWithoutQty} lote(s) sem nenhuma peça.
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

/* Mostra quanto ainda falta alocar por tamanho dentro de uma cor */
function ColorRemainder({
  color,
  colorLots,
  sizes,
}: {
  color: ColorRow;
  colorLots: LotRow[];
  sizes: string[];
}) {
  const remaining = sizes.map((s) => {
    const grade = Number(color.sizes[s]) || 0;
    const alloc = colorLots.reduce((acc, l) => acc + (Number(l.sizes[s]) || 0), 0);
    return { size: s, diff: grade - alloc };
  });
  const pending = remaining.filter((r) => r.diff !== 0);
  if (pending.length === 0) return null;
  return (
    <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 pl-1">
      <span className="font-medium">Falta alocar:</span>
      {pending.map((r) => (
        <span key={r.size} className={r.diff < 0 ? "text-destructive" : ""}>
          {r.size}: {r.diff > 0 ? r.diff : `${r.diff} (excedeu)`}
        </span>
      ))}
    </div>
  );
}

function Header({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 text-[13px] font-semibold">
      <span className="text-muted-foreground">{icon}</span>
      {title}
    </div>
  );
}

"use client";

import * as React from "react";
import { Plus, Trash2, Check, X, Pencil } from "lucide-react";
import { LisionCard, LisionCardHeader } from "@/components/ui/lision-card";
import { Button } from "@/components/ui/button";
import { useServerData } from "@/hooks/use-server-data";
import { showToast } from "@/lib/toast";
import { Skeleton } from "@/components/ui/skeleton";

interface ReferenceTarget {
  id: string;
  reference: string;
  meta_coefficient: number;
  description: string | null;
  created_at: string;
}

function ReferencesConfig() {
  const { data, isLoading, refetch } =
    useServerData<ReferenceTarget[]>("/api/settings/references");

  const [newRef, setNewRef] = React.useState("");
  const [newCoef, setNewCoef] = React.useState("");
  const [newDesc, setNewDesc] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const [editId, setEditId] = React.useState<string | null>(null);
  const [editCoef, setEditCoef] = React.useState("");
  const [editDesc, setEditDesc] = React.useState("");

  const list = data || [];

  async function handleAdd() {
    const coef = Number(newCoef);
    if (!newRef.trim()) {
      showToast("error", "Informe a referência");
      return;
    }
    if (Number.isNaN(coef) || coef <= 0) {
      showToast("error", "Coeficiente deve ser maior que 0");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings/references", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference: newRef.trim(),
          meta_coefficient: coef,
          description: newDesc.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Erro ao cadastrar");
      }
      showToast("success", "Referência cadastrada");
      setNewRef("");
      setNewCoef("");
      setNewDesc("");
      refetch();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao cadastrar");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(item: ReferenceTarget) {
    setEditId(item.id);
    setEditCoef(String(item.meta_coefficient));
    setEditDesc(item.description ?? "");
  }

  async function handleSaveEdit(id: string) {
    const coef = Number(editCoef);
    if (Number.isNaN(coef) || coef <= 0) {
      showToast("error", "Coeficiente deve ser maior que 0");
      return;
    }
    try {
      const res = await fetch(`/api/settings/references/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meta_coefficient: coef,
          description: editDesc.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Erro ao atualizar");
      }
      showToast("success", "Referência atualizada");
      setEditId(null);
      refetch();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao atualizar");
    }
  }

  async function handleDelete(id: string, reference: string) {
    if (!confirm(`Remover a referência "${reference}"?`)) return;
    try {
      const res = await fetch(`/api/settings/references/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      showToast("success", "Referência removida");
      refetch();
    } catch {
      showToast("error", "Erro ao remover");
    }
  }

  return (
    <LisionCard>
      <LisionCardHeader
        eyebrow="Produção"
        title="Referências e Metas"
      />

      <p className="text-xs text-muted-foreground/70 mb-4">
        Cadastre o peso (coeficiente de meta) de cada referência. Ao criar uma OP,
        o sistema preenche o coeficiente automaticamente. Ex: a referência 1006
        com coeficiente 2,0 vale o dobro no cálculo da meta.
      </p>

      {/* Add row */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_120px_1fr_auto] gap-2 items-end mb-5 p-3 rounded-lg bg-secondary/30 border border-border/40">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">
            Referência
          </label>
          <input
            className="input-field"
            placeholder="Ex: 1006"
            value={newRef}
            onChange={(e) => setNewRef(e.target.value)}
            disabled={saving}
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">
            Coeficiente
          </label>
          <input
            type="number"
            step="0.01"
            min={0}
            className="input-field tabular-nums"
            placeholder="2.0"
            value={newCoef}
            onChange={(e) => setNewCoef(e.target.value)}
            disabled={saving}
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">
            Descrição
          </label>
          <input
            className="input-field"
            placeholder="Opcional"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            disabled={saving}
          />
        </div>
        <Button onClick={handleAdd} disabled={saving} className="gap-1.5">
          <Plus className="size-4" />
          Adicionar
        </Button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          Nenhuma referência cadastrada ainda.
        </div>
      ) : (
        <div className="space-y-1.5">
          {list.map((item) => {
            const editing = editId === item.id;
            return (
              <div
                key={item.id}
                className="grid grid-cols-[1fr_120px_1fr_auto] gap-2 items-center p-2.5 rounded-lg border border-border/40 hover:bg-secondary/20 transition"
              >
                <div className="font-mono text-sm font-medium">{item.reference}</div>

                {editing ? (
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    className="input-field tabular-nums h-8"
                    value={editCoef}
                    onChange={(e) => setEditCoef(e.target.value)}
                  />
                ) : (
                  <div className="tabular-nums text-sm">
                    {Number(item.meta_coefficient).toLocaleString("pt-BR", {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 2,
                    })}
                  </div>
                )}

                {editing ? (
                  <input
                    className="input-field h-8"
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    placeholder="Descrição"
                  />
                ) : (
                  <div className="text-sm text-muted-foreground truncate">
                    {item.description || "—"}
                  </div>
                )}

                <div className="flex items-center gap-1 justify-end">
                  {editing ? (
                    <>
                      <button
                        onClick={() => handleSaveEdit(item.id)}
                        className="p-1.5 rounded-md hover:bg-secondary text-emerald-500"
                        title="Salvar"
                      >
                        <Check className="size-4" />
                      </button>
                      <button
                        onClick={() => setEditId(null)}
                        className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground"
                        title="Cancelar"
                      >
                        <X className="size-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => startEdit(item)}
                        className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground"
                        title="Editar"
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id, item.reference)}
                        className="p-1.5 rounded-md hover:bg-secondary text-destructive"
                        title="Remover"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </LisionCard>
  );
}

export { ReferencesConfig };

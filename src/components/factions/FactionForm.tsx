"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { showToast } from "@/lib/toast";
import type { Faction } from "@/hooks/use-factions-data";

interface FactionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  faction?: Faction | null;
  onSuccess: () => void;
}

const TYPES = [
  { value: "COSTURA", label: "Costura" },
  { value: "ACABAMENTO", label: "Acabamento" },
  { value: "OUTRO", label: "Outro" },
];

function FactionForm({ open, onOpenChange, faction, onSuccess }: FactionFormProps) {
  const isEdit = !!faction?.id;

  const [name, setName] = React.useState("");
  const [type, setType] = React.useState("");
  const [contactName, setContactName] = React.useState("");
  const [contactPhone, setContactPhone] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [pricePerPiece, setPricePerPiece] = React.useState("");
  const [avgDays, setAvgDays] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (open && faction) {
      setName(faction.name || "");
      setType(faction.type || "");
      setContactName(faction.contact_name || "");
      setContactPhone(faction.contact_phone || "");
      setAddress((faction as Faction & { address?: string }).address || "");
      setPricePerPiece(faction.price_per_piece ? String(faction.price_per_piece) : "");
      setAvgDays(String(faction.avg_delivery_days || ""));
    } else if (open) {
      setName("");
      setType("");
      setContactName("");
      setContactPhone("");
      setAddress("");
      setPricePerPiece("");
      setAvgDays("");
    }
    setErrors({});
  }, [open, faction]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Nome é obrigatório";
    if (!type) e.type = "Tipo é obrigatório";
    if (!contactName.trim()) e.contactName = "Nome do contato é obrigatório";
    if (!contactPhone.trim()) e.contactPhone = "Telefone é obrigatório";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const payload = {
        name: name.trim(),
        type,
        contactName: contactName.trim(),
        contactPhone: contactPhone.trim(),
        address: address.trim() || null,
        pricePerPiece: pricePerPiece ? parseFloat(pricePerPiece) : null,
        avgDeliveryDays: avgDays ? parseInt(avgDays) : 7,
      };

      const url = isEdit ? `/api/factions/${faction!.id}` : "/api/factions";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Erro ao salvar facção");
      }

      showToast("success", isEdit ? "Facção atualizada" : "Facção criada");
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro inesperado");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Facção" : "Nova Facção"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Atualize os dados da facção." : "Preencha os dados para cadastrar uma nova facção."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input className="input-field" value={name} onChange={(e) => setName(e.target.value)} />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Tipo *</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="input-field"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {errors.type && <p className="text-xs text-destructive">{errors.type}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nome Contato *</Label>
              <Input className="input-field" value={contactName} onChange={(e) => setContactName(e.target.value)} />
              {errors.contactName && <p className="text-xs text-destructive">{errors.contactName}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Telefone *</Label>
              <Input className="input-field" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
              {errors.contactPhone && <p className="text-xs text-destructive">{errors.contactPhone}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Endereço</Label>
            <Input className="input-field" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Preço/peça (R$)</Label>
              <Input className="input-field" type="number" step="0.01" min="0" value={pricePerPiece} onChange={(e) => setPricePerPiece(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Prazo médio (dias)</Label>
              <Input className="input-field" type="number" min="1" value={avgDays} onChange={(e) => setAvgDays(e.target.value)} />
            </div>
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Salvando..." : isEdit ? "Salvar" : "Criar Facção"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { FactionForm };

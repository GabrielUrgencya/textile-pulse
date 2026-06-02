"use client";

import * as React from "react";
import { LisionCard, LisionCardHeader } from "@/components/ui/lision-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { useServerData } from "@/hooks/use-server-data";
import { showToast } from "@/lib/toast";
import { Skeleton } from "@/components/ui/skeleton";

interface ProfileData {
  id: string;
  fullName: string;
  role: string;
  email: string;
  phone: string | null;
}

function ProfileEdit() {
  const { data, isLoading } = useServerData<{ profile: ProfileData }>("/api/profile");
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (data?.profile) {
      setName(data.profile.fullName);
      setPhone(data.profile.phone || "");
    }
  }, [data]);

  const handleSave = async () => {
    if (!name.trim()) {
      showToast("warning", "Nome é obrigatório");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() || null }),
      });
      if (!res.ok) throw new Error();
      showToast("success", "Perfil atualizado");
    } catch {
      showToast("error", "Erro ao salvar perfil");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <LisionCard>
        <Skeleton className="h-6 w-32 mb-6" />
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </LisionCard>
    );
  }

  return (
    <LisionCard>
      <LisionCardHeader
        eyebrow="Minha conta"
        title="Perfil"
        right={data?.profile?.role ? <StatusBadge status="neutral">{data.profile.role}</StatusBadge> : undefined}
      />

      <div className="space-y-4">
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">Nome</label>
          <input
            className="input-field"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">Email</label>
          <input
            className="input-field opacity-60 cursor-not-allowed"
            value={data?.profile?.email || ""}
            readOnly
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">Telefone</label>
          <input
            className="input-field"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(00) 00000-0000"
          />
        </div>

        <Button onClick={handleSave} disabled={saving} className="mt-2">
          {saving ? "Salvando..." : "Salvar Alterações"}
        </Button>
      </div>
    </LisionCard>
  );
}

export { ProfileEdit };

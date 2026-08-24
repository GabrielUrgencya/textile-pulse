"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import type { SalesTvAdminStatus, SalesTvSecret } from "@/lib/sales-tv-admin";

function defaultExpiry() {
  const value = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  value.setSeconds(0, 0);
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

async function request<T>(method: string, payload?: unknown): Promise<T> {
  const response = await fetch("/api/vendas/admin/tv", {
    method,
    headers: payload ? { "Content-Type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
    cache: "no-store",
  });
  const value = await response.json();
  if (!response.ok)
    throw new Error(value?.error?.message ?? "Gestão da TV indisponível.");
  return value.data as T;
}

export function SalesTvAdmin() {
  const [status, setStatus] = useState<SalesTvAdminStatus | null>(null);
  const [secret, setSecret] = useState<SalesTvSecret | null>(null);
  const [name, setName] = useState("TV principal");
  const [expiresAt, setExpiresAt] = useState(defaultExpiry);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [copying, setCopying] = useState(false);
  const [origin, setOrigin] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await request<SalesTvAdminStatus>("GET"));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Gestão da TV indisponível.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => void load(), [load]);
  useEffect(() => {
    const clearSecret = () => setSecret(null);
    const hideSecret = () => {
      if (document.visibilityState === "hidden") clearSecret();
    };
    window.addEventListener("pagehide", clearSecret);
    document.addEventListener("visibilitychange", hideSecret);
    return () => {
      clearSecret();
      window.removeEventListener("pagehide", clearSecret);
      document.removeEventListener("visibilitychange", hideSecret);
    };
  }, []);

  async function mutate(method: "POST" | "PATCH" | "DELETE") {
    if (
      method === "DELETE" &&
      (!status?.active || !window.confirm("Revogar este acesso da TV agora?"))
    )
      return;
    setSaving(true);
    setError(null);
    setSecret(null);
    try {
      if (method === "POST") {
        const revealed = await request<SalesTvSecret>(method, {
          name,
          expiresAt: new Date(expiresAt).toISOString(),
        });
        setOrigin(window.location.origin);
        setSecret(revealed);
        setAnnouncement(
          "Acesso criado. Copie o endereço agora; ele não será exibido novamente.",
        );
      } else if (method === "PATCH" && status?.active) {
        const revealed = await request<SalesTvSecret>(method, {
          credentialId: status.credential_id,
          expiresAt: new Date(expiresAt).toISOString(),
        });
        setOrigin(window.location.origin);
        setSecret(revealed);
        setAnnouncement(
          "Acesso rotacionado. O endereço anterior foi invalidado.",
        );
      } else if (method === "DELETE" && status?.active) {
        await request(method, { credentialId: status.credential_id });
        setAnnouncement("Acesso da TV revogado.");
      }
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Operação indisponível.",
      );
    } finally {
      setSaving(false);
    }
  }

  const oneTimeUrl = useMemo(
    () =>
      secret && origin ? `${origin}/vendas/tv#token=${secret.token}` : null,
    [origin, secret],
  );

  async function copyOneTimeUrl() {
    if (!oneTimeUrl || copying) return;
    setCopying(true);
    try {
      await navigator.clipboard.writeText(oneTimeUrl);
      setAnnouncement("Endereço seguro copiado.");
    } catch {
      setAnnouncement(
        "Não foi possível copiar. Selecione e copie o endereço manualmente.",
      );
    } finally {
      setCopying(false);
    }
  }
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="LISION Vendas"
        title="Acesso da TV coletiva"
        description="Crie, rotacione ou revogue a credencial exclusiva do painel compartilhado."
      />
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      {error && (
        <div
          role="alert"
          className="border-destructive/30 text-destructive rounded-lg border p-3"
        >
          {error}{" "}
          <Button variant="link" onClick={() => void load()}>
            Tentar novamente
          </Button>
        </div>
      )}
      {secret && oneTimeUrl && (
        <Card className="border-warning/40">
          <CardHeader>
            <CardTitle>Revelação única</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p>
              Copie este endereço agora. Depois de fechar este aviso, o segredo
              não poderá ser recuperado.
            </p>
            <Label htmlFor="tv-one-time-url">Endereço seguro da TV</Label>
            <Input
              id="tv-one-time-url"
              readOnly
              value={oneTimeUrl}
              onFocus={(event) => event.currentTarget.select()}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={copying}
                onClick={() => void copyOneTimeUrl()}
              >
                {copying ? "Copiando..." : "Copiar endereço"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSecret(null)}
              >
                Já copiei · ocultar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Credencial atual{" "}
            {status?.active ? (
              <StatusBadge status="success">Ativa</StatusBadge>
            ) : (
              <StatusBadge status="neutral">Sem acesso ativo</StatusBadge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p role="status" className="text-muted-foreground">
              Carregando estado da TV...
            </p>
          ) : status?.active ? (
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground text-sm">Nome</dt>
                <dd>{status.name}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-sm">Geração</dt>
                <dd>{status.generation}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-sm">Expira em</dt>
                <dd>{new Date(status.expires_at).toLocaleString("pt-BR")}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-sm">Segredo</dt>
                <dd>Oculto e irrecuperável</dd>
              </div>
            </dl>
          ) : (
            <p className="text-muted-foreground">
              Nenhuma credencial ativa para esta empresa.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="tv-name">Nome do ponto de exibição</Label>
              <Input
                id="tv-name"
                value={name}
                maxLength={120}
                disabled={Boolean(status?.active)}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="tv-expires">Validade</Label>
              <Input
                id="tv-expires"
                type="datetime-local"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {status?.active ? (
              <>
                <Button disabled={saving} onClick={() => void mutate("PATCH")}>
                  {saving ? "Processando..." : "Rotacionar acesso"}
                </Button>
                <Button
                  disabled={saving}
                  variant="destructive"
                  onClick={() => void mutate("DELETE")}
                >
                  Revogar acesso
                </Button>
              </>
            ) : (
              <Button
                disabled={saving || loading || !name.trim()}
                onClick={() => void mutate("POST")}
              >
                {saving ? "Criando..." : "Criar acesso da TV"}
              </Button>
            )}
          </div>
          <p className="text-muted-foreground text-sm">
            A rotação invalida imediatamente o endereço anterior. O segredo
            aparece somente uma vez e não é armazenado nesta página.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

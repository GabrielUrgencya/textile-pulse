"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BrandLogo } from "@/components/ui/brand-logo";
import { InstallButton } from "./InstallButton";

const TOKEN_STORAGE_KEY = "faction_portal_token";

// localStorage tolerante (Safari privado / storage cheio não pode quebrar o login)
function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* no-op */ }
}

export default function PortalLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get("token") || "";

  const [token, setToken] = useState(tokenFromUrl);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Enquanto checamos se já há sessão válida, não piscamos o formulário.
  const [checking, setChecking] = useState(true);
  // O token pré-preenchido pode vir do localStorage (facção que já recebeu o
  // link antes) — o campo some quando temos token, restando só o PIN.
  const [hasToken, setHasToken] = useState(!!tokenFromUrl);

  // 1) Sessão já ativa? (cookie de 30 dias) → vai direto ao dashboard, sem
  //    pedir token+PIN de novo. É o caso do app instalado reabrindo em /portal.
  useEffect(() => {
    let alive = true;
    fetch("/api/faction/auth/session")
      .then((r) => {
        if (!alive) return;
        if (r.ok) {
          router.replace("/portal/dashboard");
        } else {
          setChecking(false);
        }
      })
      .catch(() => { if (alive) setChecking(false); });
    return () => { alive = false; };
  }, [router]);

  // 2) Memória do token: veio na URL → guarda. Não veio → recupera o guardado,
  //    para a facção não ter que re-colar o link inteiro, só digitar o PIN.
  useEffect(() => {
    if (tokenFromUrl) {
      setToken(tokenFromUrl);
      setHasToken(true);
      safeSet(TOKEN_STORAGE_KEY, tokenFromUrl);
    } else {
      const saved = safeGet(TOKEN_STORAGE_KEY);
      if (saved) {
        setToken(saved);
        setHasToken(true);
      }
    }
  }, [tokenFromUrl]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/faction/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, pin }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Falha no login");
        return;
      }

      // Login OK → memoriza o token para os próximos acessos (além do cookie).
      if (token) safeSet(TOKEN_STORAGE_KEY, token);
      router.replace("/portal/dashboard");
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  // Enquanto verifica a sessão existente, mostra só o spinner (evita piscar o
  // formulário de login para quem já está autenticado).
  if (checking) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="flex flex-col items-center text-center">
          <BrandLogo className="h-8 w-auto" priority />
          <p className="mt-3 text-sm text-muted-foreground">
            Portal da Facção
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {!hasToken && (
            <div className="space-y-2">
              <label
                htmlFor="token"
                className="text-sm font-medium text-muted-foreground"
              >
                Token de acesso
              </label>
              <input
                id="token"
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Cole o token recebido"
                className="w-full rounded-lg border border-border bg-card px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                required
              />
            </div>
          )}

          <div className="space-y-2">
            <label
              htmlFor="pin"
              className="text-sm font-medium text-muted-foreground"
            >
              PIN de 6 dígitos
            </label>
            <input
              id="pin"
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="[0-9]{6}"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              placeholder="••••••"
              className="w-full rounded-lg border border-border bg-card px-4 py-3 text-center text-2xl tracking-[0.5em] outline-none focus:ring-2 focus:ring-ring"
              required
              autoFocus
            />
          </div>

          {error && (
            <p className="text-center text-sm text-destructive">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || pin.length !== 6}
            className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        {/* Instalar como app — já no primeiro acesso (o dono pediu). */}
        <InstallButton />

        <p className="text-center text-xs text-muted-foreground">
          Acesso exclusivo para facções parceiras da Liserie.
        </p>
      </div>
    </div>
  );
}

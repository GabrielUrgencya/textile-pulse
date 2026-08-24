"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { BrandLogo } from "@/components/ui/brand-logo";

function safeRedirect(value: string | null): string {
  return value === "/vendas" || value?.startsWith("/vendas/") ? value : "/vendas";
}

type Mode = "email" | "pin";

export function SalesLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function messageFor(status: number, fallback: string): string {
    if (status === 503) return "O serviço de autenticação está temporariamente indisponível.";
    if (status === 429) return "Muitas tentativas. Aguarde um pouco e tente novamente.";
    return fallback;
  }

  async function finishOk() {
    router.replace(safeRedirect(searchParams.get("redirect")));
    router.refresh();
  }

  async function submitEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(messageFor(response.status, body?.error ?? "Credenciais inválidas."));
        return;
      }
      await finishOk();
    } catch {
      setError("Não foi possível conectar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  async function submitPin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(messageFor(response.status, body?.error ?? "PIN inválido."));
        return;
      }
      await finishOk();
    } catch {
      setError("Não foi possível conectar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  const inputClass = "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition focus:border-foreground focus:ring-2 focus:ring-ring/10";

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 text-foreground">
      <section className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-elegant">
        <div className="mb-7 flex flex-col items-center text-center">
          <BrandLogo className="mb-3 h-8 w-auto !invert" priority />
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Gestão comercial</p>
        </div>
        <h1 className="mb-1 text-xl font-semibold">Entrar no LISION Vendas</h1>
        <p className="mb-5 text-sm text-muted-foreground">Use as mesmas credenciais do LISION — e-mail e senha ou PIN.</p>

        <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg border border-border bg-secondary/30 p-1">
          <button
            type="button"
            onClick={() => { setMode("email"); setError(""); }}
            className={`h-9 rounded-md text-sm font-medium transition ${mode === "email" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
          >
            E-mail e senha
          </button>
          <button
            type="button"
            onClick={() => { setMode("pin"); setError(""); }}
            className={`h-9 rounded-md text-sm font-medium transition ${mode === "pin" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
          >
            PIN
          </button>
        </div>

        {mode === "email" ? (
          <form className="space-y-4" onSubmit={submitEmail}>
            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="sales-email">E-mail</label>
              <input id="sales-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading} className={inputClass} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="sales-password">Senha</label>
              <input id="sales-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} className={inputClass} />
            </div>
            {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
            <button type="submit" disabled={loading} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-zinc-950 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60">
              {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={submitPin}>
            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="sales-pin">PIN (6 dígitos)</label>
              <input
                id="sales-pin"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                disabled={loading}
                maxLength={6}
                placeholder="000000"
                className={`${inputClass} text-center font-mono text-lg tracking-[0.4em]`}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">O mesmo PIN que você usa para bipar no LISION.</p>
            </div>
            {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
            <button type="submit" disabled={loading || pin.length < 4} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-zinc-950 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60">
              {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {loading ? "Entrando..." : "Entrar com PIN"}
            </button>
          </form>
        )}

        <a className="mt-5 block text-center text-sm text-muted-foreground underline-offset-4 hover:underline" href="/login">
          Voltar ao LISION
        </a>
      </section>
    </main>
  );
}

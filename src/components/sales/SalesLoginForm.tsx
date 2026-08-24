"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { BrandLogo } from "@/components/ui/brand-logo";

function safeRedirect(value: string | null): string {
  return value === "/vendas" || value?.startsWith("/vendas/") ? value : "/vendas";
}

export function SalesLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
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
        setError(
          response.status === 503
            ? "O serviço de autenticação está temporariamente indisponível."
            : body?.error ?? "Credenciais inválidas.",
        );
        return;
      }
      router.replace(safeRedirect(searchParams.get("redirect")));
      router.refresh();
    } catch {
      setError("Não foi possível conectar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 text-foreground">
      <section className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-elegant">
        <div className="mb-7 flex flex-col items-center text-center">
          <BrandLogo className="mb-3 h-8 w-auto !invert" priority />
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Gestão comercial
          </p>
        </div>
        <h1 className="mb-1 text-xl font-semibold">Entrar no LISION Vendas</h1>
        <p className="mb-6 text-sm text-muted-foreground">Use seu e-mail e senha do LISION.</p>
        <form className="space-y-4" onSubmit={submit}>
          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="sales-email">
              E-mail
            </label>
            <input
              id="sales-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={loading}
              className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition focus:border-foreground focus:ring-2 focus:ring-ring/10"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="sales-password">
              Senha
            </label>
            <input
              id="sales-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={loading}
              className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition focus:border-foreground focus:ring-2 focus:ring-ring/10"
            />
          </div>
          {error ? (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-zinc-950 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
        <a className="mt-5 block text-center text-sm text-muted-foreground underline-offset-4 hover:underline" href="/login">
          Voltar ao LISION
        </a>
      </section>
    </main>
  );
}

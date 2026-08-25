"use client";

import { Suspense, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { KeyRound, Mail, ArrowLeft, Loader2, AlertTriangle } from "lucide-react";
import { BrandLogo } from "@/components/ui/brand-logo";

type AuthMode = "choose" | "email" | "pin";

// Vendedor não tem áreas de produção — cai direto no módulo LISION Vendas.
// O roteamento do /vendas decide entre /vendas/admin e /vendas/app conforme o vínculo.
function landingFor(role: unknown): string {
  return role === "VENDEDOR" ? "/vendas" : "/dashboard";
}

function LoginContent() {
  const router = useRouter();
  // HOTFIX multi-tenant: /login?tenant=<slug> define o tenant sem depender do
  // env de build (NEXT_PUBLIC_DEFAULT_TENANT_ID) — sem redeploy por tenant.
  const searchParams = useSearchParams();
  const tenantSlug = searchParams.get("tenant");
  const [mode, setMode] = useState<AuthMode>("choose");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Email mode state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // PIN mode state
  const [pin, setPin] = useState("");
  const [tenantId] = useState(process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID ?? "");

  const clearError = useCallback(() => setError(""), []);

  /* ────────────────── Email Login ────────────────── */

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(
          res.status === 503
            ? "O serviço de autenticação está temporariamente indisponível. Tente novamente em alguns instantes."
            : data?.error || "Credenciais inválidas"
        );
        return;
      }

      const data = await res.json().catch(() => null);
      router.push(landingFor(data?.user?.role));
      router.refresh();
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  /* ────────────────── PIN Login ────────────────── */

  async function handlePinSubmit(currentPin: string) {
    if (currentPin.length < 4) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // ?tenant=<slug> tem prioridade; sem ele, mantém o tenant default do env
        body: JSON.stringify(
          tenantSlug ? { tenantSlug, pin: currentPin } : { tenantId, pin: currentPin },
        ),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || "PIN inválido");
        setPin("");
        return;
      }

      const data = await res.json().catch(() => null);
      router.push(landingFor(data?.user?.role));
      router.refresh();
    } catch {
      setError("Erro de conexão. Tente novamente.");
      setPin("");
    } finally {
      setLoading(false);
    }
  }

  function handlePinDigit(digit: string) {
    if (loading) return;
    clearError();
    const next = pin + digit;
    setPin(next);
    if (next.length === 6) {
      handlePinSubmit(next);
    }
  }

  function handlePinBackspace() {
    if (loading) return;
    clearError();
    setPin((p) => p.slice(0, -1));
  }

  /* ────────────────── Render ────────────────── */

  return (
    <div className="min-h-dvh bg-background text-foreground relative flex items-center justify-center">
      <div className="fixed inset-0 bg-grid opacity-30 pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md mx-4"
      >
        {/* Branding */}
        <div className="flex flex-col items-center text-center mb-8">
          <BrandLogo className="h-8 w-auto mb-3" priority />
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Rastreamento Têxtil
          </div>
        </div>

        {/* Card */}
        <div className="relative rounded-2xl bg-card-gradient border border-border/60 border-gradient shadow-elegant overflow-hidden p-6">
          <AnimatePresence mode="wait">
            {mode === "choose" && (
              <motion.div
                key="choose"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80 mb-1.5 font-medium">
                  Autenticação
                </div>
                <h2 className="text-[15px] font-semibold tracking-tight mb-6">
                  Como deseja acessar?
                </h2>

                <div className="space-y-3">
                  <button
                    onClick={() => { setMode("email"); clearError(); }}
                    className="w-full flex items-center gap-4 p-4 rounded-xl bg-secondary/30 border border-border/40 hover:border-foreground/40 transition group"
                  >
                    <div className="size-10 rounded-lg bg-foreground text-background grid place-items-center shrink-0">
                      <Mail className="size-5" />
                    </div>
                    <div className="text-left">
                      <div className="text-[13px] font-medium">Email e Senha</div>
                      <div className="text-[11px] text-muted-foreground">Admin e Gerentes</div>
                    </div>
                  </button>

                  <button
                    onClick={() => { setMode("pin"); clearError(); }}
                    className="w-full flex items-center gap-4 p-4 rounded-xl bg-secondary/30 border border-border/40 hover:border-foreground/40 transition group"
                  >
                    <div className="size-10 rounded-lg bg-foreground text-background grid place-items-center shrink-0">
                      <KeyRound className="size-5" />
                    </div>
                    <div className="text-left">
                      <div className="text-[13px] font-medium">PIN Rápido</div>
                      <div className="text-[11px] text-muted-foreground">Operadores — Chão de Fábrica</div>
                    </div>
                  </button>
                </div>
              </motion.div>
            )}

            {mode === "email" && (
              <motion.div
                key="email"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              >
                <button
                  onClick={() => { setMode("choose"); clearError(); }}
                  className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground mb-4 transition"
                >
                  <ArrowLeft className="size-3" /> Voltar
                </button>

                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80 mb-1.5 font-medium">
                  Login
                </div>
                <h2 className="text-[15px] font-semibold tracking-tight mb-5">
                  Email e Senha
                </h2>

                <form onSubmit={handleEmailLogin} className="space-y-4">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1.5">
                      Email
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); clearError(); }}
                      className="w-full h-10 px-3 rounded-lg bg-secondary/40 border border-border/60 text-[13px] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring transition"
                      placeholder="admin@lision.com"
                      autoComplete="email"
                      disabled={loading}
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1.5">
                      Senha
                    </label>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); clearError(); }}
                      className="w-full h-10 px-3 rounded-lg bg-secondary/40 border border-border/60 text-[13px] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring transition"
                      placeholder="••••••••"
                      autoComplete="current-password"
                      disabled={loading}
                    />
                  </div>

                  {error && <ErrorBanner message={error} />}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full h-10 rounded-lg bg-foreground text-background text-[13px] font-semibold hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="size-4 animate-spin" /> : "Entrar"}
                  </button>
                </form>
              </motion.div>
            )}

            {mode === "pin" && (
              <motion.div
                key="pin"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              >
                <button
                  onClick={() => { setMode("choose"); clearError(); setPin(""); }}
                  className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground mb-4 transition"
                >
                  <ArrowLeft className="size-3" /> Voltar
                </button>

                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80 mb-1.5 font-medium">
                  Acesso Rápido
                </div>
                <h2 className="text-[15px] font-semibold tracking-tight mb-5">
                  Digite seu PIN
                </h2>

                {/* PIN dots */}
                <div className="flex items-center justify-center gap-3 mb-6">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <motion.div
                      key={i}
                      animate={pin.length === i ? { scale: [1, 1.2, 1] } : {}}
                      transition={{ duration: 0.2 }}
                      className={`size-4 rounded-full border-2 transition-colors ${
                        i < pin.length
                          ? "bg-foreground border-foreground"
                          : "border-border/60 bg-transparent"
                      }`}
                    />
                  ))}
                </div>

                {error && <ErrorBanner message={error} />}

                {/* Numpad */}
                <div className="grid grid-cols-3 gap-2 max-w-[280px] mx-auto">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "←"].map((key) => {
                    if (key === "") return <div key="empty" />;
                    if (key === "←") {
                      return (
                        <button
                          key="backspace"
                          onClick={handlePinBackspace}
                          disabled={loading || pin.length === 0}
                          className="h-14 rounded-xl bg-secondary/40 border border-border/40 text-[18px] font-mono hover:bg-secondary/60 disabled:opacity-30 disabled:cursor-not-allowed transition active:scale-95"
                        >
                          ←
                        </button>
                      );
                    }
                    return (
                      <button
                        key={key}
                        onClick={() => handlePinDigit(key)}
                        disabled={loading || pin.length >= 6}
                        className="h-14 rounded-xl bg-secondary/40 border border-border/40 text-[20px] font-display font-semibold hover:bg-secondary/60 disabled:opacity-30 disabled:cursor-not-allowed transition active:scale-95"
                      >
                        {key}
                      </button>
                    );
                  })}
                </div>

                {loading && (
                  <div className="flex items-center justify-center gap-2 mt-4 text-[11px] text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" /> Verificando...
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-[10px] text-muted-foreground">
          LISION — Rastreamento Têxtil
        </div>
      </motion.div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-2.5 text-[12px] py-2 px-3 rounded-md bg-destructive/10 border border-destructive/20"
    >
      <AlertTriangle className="size-3.5 mt-0.5 text-destructive shrink-0" />
      <span className="text-foreground/80">{message}</span>
    </motion.div>
  );
}

// useSearchParams exige Suspense boundary (mesmo padrão da TV)
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen bg-background text-muted-foreground text-[14px]">
          Carregando...
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}

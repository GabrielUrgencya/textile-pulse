import * as React from "react";

/**
 * Marca oficial do LISION. Substitui o "L" + texto "Lision" montado à mão.
 * - variant="full"   → logo completa (símbolo + LISION), traço branco transparente.
 * - variant="symbol" → só o símbolo (sidebar recolhida, ícones).
 *
 * A arte é branca sobre fundo transparente: cai direto no tema escuro do app.
 * Use className para dimensionar (ex.: h-7 w-auto). alt fixo em "Lision".
 */
export function BrandLogo({
  variant = "full",
  className,
  priority,
}: {
  variant?: "full" | "symbol";
  className?: string;
  /** Marca como carregamento prioritário (login/splash). */
  priority?: boolean;
}) {
  const src = variant === "symbol" ? "/brand/symbol-lision.webp" : "/brand/logo-lision.webp";
  // A arte é BRANCA. No escuro (.dark, padrão do app) fica branca; no claro
  // (portal em modo claro) invertemos para preto, senão sumiria no fundo claro.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="Lision"
      draggable={false}
      loading={priority ? "eager" : "lazy"}
      className={`invert dark:invert-0 max-w-full object-contain ${className ?? ""}`}
    />
  );
}

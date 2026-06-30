import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Escape LIKE/ILIKE wildcard characters for safe search queries */
export function escapeLikePattern(input: string): string {
  return input.replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Sanitiza a "unidade" de exibição: unidade puramente numérica (ex.: "10") é
 * ruído de cadastro e não deve poluir o valor — retorna "". Caso contrário,
 * devolve a unidade limpa. Usado nos cards de meta (corrige "0 / 10 10").
 */
export function displayUnit(unit?: string | null): string {
  const u = (unit || "").trim();
  if (!u) return "";
  if (/^\d+([.,]\d+)?$/.test(u)) return ""; // só números → descarta
  return u;
}

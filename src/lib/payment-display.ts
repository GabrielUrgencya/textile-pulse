/**
 * Display semântico de valores financeiros para a facção.
 *
 * Regra de ouro: NUNCA expor valor negativo com sinal "−" ao usuário do portal.
 * O saldo (factions.current_balance, mantido pelo ledger) é traduzido em
 * linguagem descritiva conforme o cenário.
 */

export type PaymentTone = "success" | "warning" | "destructive" | "neutral";

export interface PaymentSummary {
  label: string;
  tone: PaymentTone;
}

/** Formata em pt-BR com 2 casas (sem símbolo). */
export function fmtBRL(value: number): string {
  return Math.abs(Number(value) || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Frase-herói do saldo da facção.
 * >0 → vai receber; <0 → a compensar na próxima remessa; 0 → sem saldo.
 */
export function paymentSummaryLabel(balance: number): PaymentSummary {
  const b = Math.round((Number(balance) || 0) * 100) / 100;
  if (b > 0) {
    return { label: `Você vai receber R$ ${fmtBRL(b)}`, tone: "success" };
  }
  if (b < 0) {
    return {
      label: `Você possui R$ ${fmtBRL(b)} a compensar na próxima remessa`,
      tone: "warning",
    };
  }
  return { label: "Sem saldo pendente", tone: "neutral" };
}

/** Frase descritiva de dedução (nunca "−R$ X"). */
export function deductionLabel(deduction: number): string {
  return `Será deduzido R$ ${fmtBRL(deduction)} do seu pagamento`;
}

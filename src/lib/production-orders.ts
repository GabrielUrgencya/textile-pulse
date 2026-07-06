/**
 * Épico Robustez de Remessas (F1) — elegibilidade de OPs para remessa.
 * Status reais no banco: OPEN, IN_PROGRESS, COMPLETED, CANCELLED.
 * Fonte única para a dupla barreira (listagem de lotes + criação de remessa).
 */

export const ELIGIBLE_PO_STATUSES = ["OPEN", "IN_PROGRESS"] as const;

/**
 * Remessas nestes status mantêm o lote OCUPADO (posse ativa ou em trânsito).
 * RETURNED/CLOSED liberam o lote para novo envio — o valor antigo "RECEIVED"
 * não existe no enum e prendia lotes devolvidos para sempre (bug F1b).
 */
export const LOT_BUSY_SHIPMENT_STATUSES = [
  "PREPARING",
  "SENT",
  "RECEIVED_BY_FACTION",
  "RETURN_DECLARED",
  "PARTIALLY_RETURNED",
  "OVERDUE",
] as const;

export function isEligiblePoStatus(status: string | null | undefined): boolean {
  return (ELIGIBLE_PO_STATUSES as readonly string[]).includes(status ?? "");
}

const PO_STATUS_LABEL: Record<string, string> = {
  CANCELLED: "cancelada",
  COMPLETED: "encerrada",
  OPEN: "aberta",
  IN_PROGRESS: "em produção",
};

export function poStatusLabel(status: string | null | undefined): string {
  return PO_STATUS_LABEL[status ?? ""] ?? String(status ?? "desconhecido");
}

/**
 * Valida um conjunto de lotes contra o status das OPs (barreira 2, server-side).
 * Retorna null se tudo elegível, ou a mensagem de rejeição (422) citando a
 * primeira OP inelegível encontrada.
 */
export function validateLotsEligibility(
  lots: Array<{ id: string; po_id: string }>,
  posById: Map<string, { status: string; op_number?: string | null }>,
): string | null {
  for (const lot of lots) {
    const po = posById.get(lot.po_id);
    if (!po || !isEligiblePoStatus(po.status)) {
      const op = po?.op_number ? `OP ${po.op_number}` : "A OP do lote";
      const label = poStatusLabel(po?.status);
      return `Remessa rejeitada: ${op} está ${label}. Apenas OPs abertas ou em produção podem ser enviadas.`;
    }
  }
  return null;
}

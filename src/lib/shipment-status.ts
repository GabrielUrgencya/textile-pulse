/**
 * Fonte única de verdade do vocabulário de status de remessas de facção.
 *
 * O ciclo de vida de uma remessa (faction_shipments.status) é gravado em
 * diferentes pontos do sistema (criação = SENT, confirmação da facção =
 * RECEIVED_BY_FACTION, recebimento do retorno no admin = RECEIVED/RETURNED).
 * Consumidores (timeline, badges, filtros ativa/histórico) devem SEMPRE derivar
 * label/cor/ordem/grupo daqui — nunca manter tabelas locais divergentes.
 */

export type ShipmentStatusTone = "success" | "warning" | "destructive" | "neutral";
export type ShipmentStatusGroup = "active" | "closed";

export interface ShipmentStatusMeta {
  /** Rótulo em pt-BR exibido ao usuário. */
  label: string;
  /** Cor do StatusBadge. */
  tone: ShipmentStatusTone;
  /** Posição na timeline visual (0=Preparando, 1=Enviado, 2=Com Facção, 3=Devolvido). */
  order: 0 | 1 | 2 | 3;
  /** Ativa = peças fora/pendentes; Fechada = ciclo concluído (histórico). */
  group: ShipmentStatusGroup;
}

const STATUS_META: Record<string, ShipmentStatusMeta> = {
  PREPARING: { label: "Preparando", tone: "neutral", order: 0, group: "active" },
  PENDING: { label: "Preparando", tone: "neutral", order: 0, group: "active" },
  SENT: { label: "Enviado", tone: "warning", order: 1, group: "active" },
  RECEIVED_BY_FACTION: { label: "Com a facção", tone: "success", order: 2, group: "active" },
  RETURN_DECLARED: { label: "Devolução declarada", tone: "warning", order: 2, group: "active" },
  // Frente 3: recebido fisicamente na fábrica, conferência em andamento (dias).
  // Ativo e acionável: o financeiro só fecha quando a conferência é finalizada.
  AWAITING_INSPECTION: { label: "Aguardando conferência", tone: "warning", order: 3, group: "active" },
  OVERDUE: { label: "Atrasado", tone: "destructive", order: 2, group: "active" },
  LATE: { label: "Atrasado", tone: "destructive", order: 2, group: "active" },
  PARTIALLY_RETURNED: { label: "Devolução parcial", tone: "warning", order: 3, group: "active" },
  RETURNED: { label: "Devolvido", tone: "neutral", order: 3, group: "closed" },
  // Legado: o fluxo admin de recebimento de retorno grava "RECEIVED".
  RECEIVED: { label: "Devolvido", tone: "neutral", order: 3, group: "closed" },
  // Épico Robustez F2: estado FINAL — encerrada pelo admin após conferência+financeiro.
  CLOSED: { label: "Encerrada", tone: "success", order: 3, group: "closed" },
};

/**
 * Conjuntos para filtros server-side (F2).
 * Portal: RETURNED e CLOSED saem de "Ativas" (facção não tem mais posse).
 * Admin: só CLOSED sai — RETURNED aguardando encerramento ainda é acionável.
 */
export const PORTAL_ACTIVE_STATUSES = [
  "PREPARING",
  "SENT",
  "RECEIVED_BY_FACTION",
  "RETURN_DECLARED",
  // Frente 3: a facção vê "em conferência" enquanto a fábrica confere (dias).
  "AWAITING_INSPECTION",
  "PARTIALLY_RETURNED",
  "OVERDUE",
] as const;

export const ADMIN_ACTIVE_STATUSES = [...PORTAL_ACTIVE_STATUSES, "RETURNED"] as const;

/** Metadados do status. Fallback seguro para status desconhecido (nunca "some"). */
export function getShipmentStatusMeta(status: string | null | undefined): ShipmentStatusMeta {
  if (status && STATUS_META[status]) return STATUS_META[status];
  return { label: status || "—", tone: "neutral", order: 0, group: "active" };
}

/** true se a remessa ainda está em andamento (aparece em "Ativas"). */
export function isActiveShipment(status: string | null | undefined): boolean {
  return getShipmentStatusMeta(status).group === "active";
}

/** true se o ciclo está fechado (aparece em "Histórico"). */
export function isClosedShipment(status: string | null | undefined): boolean {
  return getShipmentStatusMeta(status).group === "closed";
}

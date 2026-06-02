const EVENT_TEMPLATES: Record<string, string> = {
  STAGE_IN: "{operator} bipou lote {barcode} em {stage}",
  STAGE_OUT: "{operator} saiu do lote {barcode} em {stage}",
  DEFECT_REPORTED: "{operator} reportou defeito em {barcode}",
  DEFECT_REPORT: "{operator} reportou defeito em {barcode}",
  REWORK_RESOLVED: "{operator} resolveu retrabalho de {barcode}",
  ORDER_CREATED: "Nova OP {op_number} criada por {operator}",
  SHIPMENT_SENT: "Remessa enviada para {faction} — {quantity} peças",
  SHIPMENT_RECEIVED: "{faction} recebeu remessa — {quantity} peças",
  scan: "{operator} bipou lote {barcode} em {stage}",
};

export interface ActivityEventRaw {
  time: string;
  operator_name: string;
  action: string;
  barcode: string;
  stage_name: string;
  op_number?: string;
  faction_name?: string;
  quantity?: number;
}

export function humanizeEvent(event: ActivityEventRaw): string {
  const template = EVENT_TEMPLATES[event.action];
  if (!template) {
    return `${event.operator_name} · ${event.action} · ${event.barcode}`;
  }

  return template
    .replace("{operator}", event.operator_name || "Operador")
    .replace("{barcode}", event.barcode || "—")
    .replace("{stage}", event.stage_name || "—")
    .replace("{op_number}", event.op_number || "—")
    .replace("{faction}", event.faction_name || "—")
    .replace("{quantity}", event.quantity?.toString() || "0");
}

export function relativeTimestamp(dateOrTime: string): string {
  // If it's just a time string like "14:30", return it as-is
  if (/^\d{2}:\d{2}$/.test(dateOrTime)) return dateOrTime;

  const now = Date.now();
  const then = new Date(dateOrTime).getTime();
  if (isNaN(then)) return dateOrTime;

  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;

  return new Date(dateOrTime).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

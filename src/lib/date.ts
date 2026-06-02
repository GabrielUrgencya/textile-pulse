import { format as fnsFormat, formatDistance as fnsFormatDistance } from "date-fns";
import { ptBR } from "date-fns/locale";

export { ptBR };

export function formatDate(date: Date | string | number, pattern: string = "dd/MM/yyyy"): string {
  return fnsFormat(typeof date === "string" ? new Date(date) : date, pattern, { locale: ptBR });
}

export function formatDistance(date: Date | string | number, baseDate: Date = new Date()): string {
  return fnsFormatDistance(typeof date === "string" ? new Date(date) : date, baseDate, { locale: ptBR });
}

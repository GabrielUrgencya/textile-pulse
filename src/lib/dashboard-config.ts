import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Épico Dashboards 2.0 (Story 8.38) — contrato de config de KPIs por setor.
 *
 * O layout é um array de KPIWidget guardado em sector_dashboard_configs.layout (JSONB).
 * O shape é validado aqui (o banco é flexível de propósito). A TV (8.40) e o
 * builder (8.41) consomem este módulo.
 */

export type WidgetType =
  | "counter"
  | "progress"
  | "chart"
  | "ranking"
  | "timer"
  | "status"
  | "comparison";

export type WidgetSize = "sm" | "md" | "lg" | "xl";

/** Métricas que um widget pode mapear (derivadas do computeSectorKpis / 8.35). */
export type WidgetMetric =
  | "meta_momento" // produção atual vs meta diária (progress/counter)
  | "distancia_meta" // quanto falta (status)
  | "metas_periodo" // semanal/mensal (comparison)
  | "tempo_processo" // decorrido + médio/lote (timer)
  | "faccao_status" // semáforo de prazo (status)
  | "producao_hora" // sparkline/area das últimas horas (chart)
  | "ranking_colaboradores" // top do setor (ranking)
  | "lotes_bipados" // contador + delta vs ontem (counter)
  | "taxa_conclusao"; // % conclusão (progress)

export interface WidgetThresholds {
  warning: number; // % da meta — abaixo disso, cor warning
  critical: number; // % da meta — abaixo disso, cor danger
}

export interface KPIWidget {
  id: string;
  type: WidgetType;
  metric: WidgetMetric | string;
  label: string;
  size: WidgetSize;
  position: { x: number; y: number };
  thresholds?: WidgetThresholds;
}

export interface SectorDashboardConfig {
  sectorId: string;
  layout: KPIWidget[];
  updatedAt: string | null;
  updatedBy: string | null;
  isDefault: boolean;
}

const WIDGET_TYPES: WidgetType[] = ["counter", "progress", "chart", "ranking", "timer", "status", "comparison"];
const WIDGET_SIZES: WidgetSize[] = ["sm", "md", "lg", "xl"];

/**
 * Layout DEFAULT por setor — cobre o que o computeSectorKpis (8.35) já entrega,
 * para a TV nunca ficar vazia quando não há config salva. Bento 12 colunas.
 */
export const DEFAULT_SECTOR_LAYOUT: KPIWidget[] = [
  { id: "w-meta", type: "progress", metric: "meta_momento", label: "Meta do Momento", size: "lg", position: { x: 0, y: 0 }, thresholds: { warning: 70, critical: 40 } },
  { id: "w-periodo", type: "comparison", metric: "metas_periodo", label: "Metas do Período", size: "md", position: { x: 6, y: 0 } },
  { id: "w-ranking", type: "ranking", metric: "ranking_colaboradores", label: "Ranking do Setor", size: "md", position: { x: 10, y: 0 } },
  { id: "w-distancia", type: "status", metric: "distancia_meta", label: "Distância da Meta", size: "sm", position: { x: 0, y: 4 } },
  { id: "w-tempo", type: "timer", metric: "tempo_processo", label: "Tempo de Processo", size: "sm", position: { x: 3, y: 4 } },
  { id: "w-faccao", type: "status", metric: "faccao_status", label: "Status da Facção", size: "sm", position: { x: 6, y: 4 } },
  { id: "w-hora", type: "chart", metric: "producao_hora", label: "Produção por Hora", size: "xl", position: { x: 0, y: 6 } },
];

/** Type guard de um widget individual (descarta itens malformados). */
function isValidWidget(w: unknown): w is KPIWidget {
  if (!w || typeof w !== "object") return false;
  const o = w as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.type === "string" && WIDGET_TYPES.includes(o.type as WidgetType) &&
    typeof o.metric === "string" &&
    typeof o.label === "string" &&
    typeof o.size === "string" && WIDGET_SIZES.includes(o.size as WidgetSize) &&
    !!o.position && typeof o.position === "object" &&
    typeof (o.position as Record<string, unknown>).x === "number" &&
    typeof (o.position as Record<string, unknown>).y === "number"
  );
}

/** Biblioteca de widgets disponíveis no builder (8.41). */
export interface WidgetCatalogEntry {
  metric: WidgetMetric;
  type: WidgetType;
  label: string;
  defaultSize: WidgetSize;
}

export const WIDGET_CATALOG: WidgetCatalogEntry[] = [
  { metric: "meta_momento", type: "progress", label: "Meta do Momento", defaultSize: "lg" },
  { metric: "distancia_meta", type: "status", label: "Distância da Meta", defaultSize: "md" },
  { metric: "tempo_processo", type: "timer", label: "Tempo de Processo", defaultSize: "sm" },
  { metric: "producao_hora", type: "chart", label: "Produção por Hora", defaultSize: "md" },
  { metric: "ranking_colaboradores", type: "ranking", label: "Ranking de Colaboradores", defaultSize: "md" },
  { metric: "faccao_status", type: "status", label: "Status de Prazo da Facção", defaultSize: "sm" },
  { metric: "lotes_bipados", type: "counter", label: "Lotes Bipados", defaultSize: "sm" },
  { metric: "taxa_conclusao", type: "progress", label: "Taxa de Conclusão", defaultSize: "md" },
];

/** Cria um KPIWidget novo a partir de uma entrada do catálogo. */
export function makeWidget(entry: WidgetCatalogEntry, index = 0): KPIWidget {
  return {
    id: `w-${(globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${index}`)}`,
    type: entry.type,
    metric: entry.metric,
    label: entry.label,
    size: entry.defaultSize,
    position: { x: index, y: 0 },
  };
}

/** layout é um array de widgets válidos? */
export function isValidLayout(layout: unknown): layout is KPIWidget[] {
  return Array.isArray(layout) && layout.every(isValidWidget);
}

/**
 * O painel "Status da Facção" aparece neste setor?
 *
 * No redesign "Instrumento" a TV usa um layout fixo (nenhum setor tem tela
 * diferente do outro), mas o dono precisa poder esconder a facção nos setores
 * onde ela não faz sentido. Em vez de coluna nova, o flag É a presença do widget
 * `faccao_status` no layout — o dado já gravado continua válido, isValidLayout
 * não muda, e o DEFAULT_SECTOR_LAYOUT já inclui o widget, então quem nunca
 * configurou continua VENDO o painel (comportamento atual preservado).
 */
export const FACTION_WIDGET_METRIC = "faccao_status";

export function isFactionPanelVisible(layout: unknown): boolean {
  if (!Array.isArray(layout)) return true; // sem config → default mostra
  return layout.some(
    (w) => isValidWidget(w) && w.metric === FACTION_WIDGET_METRIC,
  );
}

/** Liga/desliga o widget de facção num layout, preservando o resto. */
export function setFactionPanel(layout: KPIWidget[], visible: boolean): KPIWidget[] {
  const without = layout.filter((w) => w.metric !== FACTION_WIDGET_METRIC);
  if (!visible) return without;
  if (without.length === layout.length) {
    // não existia → adiciona a partir do catálogo
    const entry = WIDGET_CATALOG.find((e) => e.metric === FACTION_WIDGET_METRIC);
    if (entry) return [...layout, makeWidget(entry, layout.length)];
  }
  return layout;
}

/** Normaliza um layout desconhecido: mantém só widgets válidos; vazio → default. */
export function normalizeLayout(layout: unknown): { layout: KPIWidget[]; usedDefault: boolean } {
  if (!Array.isArray(layout)) return { layout: DEFAULT_SECTOR_LAYOUT, usedDefault: true };
  const valid = layout.filter(isValidWidget) as KPIWidget[];
  if (valid.length === 0) return { layout: DEFAULT_SECTOR_LAYOUT, usedDefault: true };
  return { layout: valid, usedDefault: false };
}

/**
 * Lê a config de um setor; devolve o layout salvo OU o default (fallback seguro).
 * Usado pela TV (service_role/kiosk) e pelo builder (sessão admin).
 */
export async function getSectorDashboardConfig(
  supabase: SupabaseClient,
  tenantId: string,
  stageId: string,
): Promise<SectorDashboardConfig> {
  const { data } = await supabase
    .from("sector_dashboard_configs")
    .select("layout, updated_at, updated_by")
    .eq("tenant_id", tenantId)
    .eq("stage_id", stageId)
    .maybeSingle();

  if (!data) {
    return { sectorId: stageId, layout: DEFAULT_SECTOR_LAYOUT, updatedAt: null, updatedBy: null, isDefault: true };
  }
  const { layout, usedDefault } = normalizeLayout(data.layout);
  return {
    sectorId: stageId,
    layout,
    updatedAt: (data.updated_at as string) ?? null,
    updatedBy: (data.updated_by as string) ?? null,
    isDefault: usedDefault,
  };
}

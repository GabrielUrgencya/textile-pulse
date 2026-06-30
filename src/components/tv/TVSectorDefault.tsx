"use client";

import type { CSSProperties } from "react";
import type { KPIWidget } from "@/lib/dashboard-config";
import type { SectorKpis } from "@/lib/sector-kpis";
import { WidgetRenderer } from "@/components/tv/widgets/WidgetRenderer";

/**
 * Refino Premium — layout FIXO da visão por setor (default).
 *
 * Grid de ÁREAS NOMEADAS: cada card vive numa célula declarada, então é
 * impossível dois cards colidirem (mata D2). As faixas de KPI ocupam só o
 * necessário (`auto`) e o gráfico de ondas absorve toda a sobra (`1fr`),
 * eliminando dead-space (mata D3). Preenche a TV exata, sem scroll.
 *
 * Usado quando o setor NÃO tem config própria (isDefault). Quando há config
 * custom do admin (8.41), a página usa o BentoGrid dinâmico.
 */

const AREAS = `
  "meta      meta      metas     metas"
  "distancia tempo     ranking   faccao"
  "grafico   grafico   grafico   grafico"
`;

const gridStyle: CSSProperties = {
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gridTemplateRows: "auto auto minmax(0, 1fr)",
  gridTemplateAreas: AREAS,
};

/** Widget sintético (label fixo) p/ reaproveitar o WidgetRenderer por métrica. */
function w(area: string, metric: string, label: string, type: KPIWidget["type"]): { area: string; widget: KPIWidget } {
  return {
    area,
    widget: { id: `def-${area}`, type, metric, label, size: "md", position: { x: 0, y: 0 } },
  };
}

const CELLS = [
  w("meta", "meta_momento", "Meta do Momento", "progress"),
  w("metas", "metas_periodo", "Metas do Período", "comparison"),
  w("distancia", "distancia_meta", "Distância da Meta", "status"),
  w("tempo", "tempo_processo", "Tempo de Processo", "timer"),
  w("ranking", "ranking_colaboradores", "Ranking do Setor", "ranking"),
  w("faccao", "faccao_status", "Status da Facção", "status"),
  w("grafico", "producao_hora", "Produção por Hora", "chart"),
];

export function TVSectorDefault({ kpis }: { kpis: SectorKpis | null }) {
  return (
    <div className="grid h-full min-h-0 w-full gap-6" style={gridStyle}>
      {CELLS.map((c, i) => (
        <div key={c.area} className="min-h-0 min-w-0" style={{ gridArea: c.area }}>
          <WidgetRenderer widget={c.widget} kpis={kpis} index={i} />
        </div>
      ))}
    </div>
  );
}

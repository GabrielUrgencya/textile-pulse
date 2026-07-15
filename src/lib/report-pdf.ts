import { jsPDF } from "jspdf";
import type { ProductionReport, SectorReportRow, OperatorReportRow } from "@/lib/report-data";

/**
 * Frente 1 — Gera o PDF do relatório (A4 retrato, claro/impressão, marca LISION).
 * Tabelas desenhadas manualmente (sem jspdf-autotable). Números pt-BR, cores de status.
 */

const INK: [number, number, number] = [24, 24, 27];
const MUTED: [number, number, number] = [113, 113, 122];
const BORDER: [number, number, number] = [228, 228, 231];
const HEADER_FILL: [number, number, number] = [244, 244, 245];
const ZEBRA: [number, number, number] = [250, 250, 250];
const GREEN: [number, number, number] = [16, 185, 129];
const AMBER: [number, number, number] = [245, 158, 11];
const RED: [number, number, number] = [239, 68, 68];
const WHITE: [number, number, number] = [255, 255, 255];

const PAGE_W = 595;
const PAGE_H = 842;
const M = 40;
const CONTENT_W = PAGE_W - 2 * M;

const fmtInt = (n: number) => Math.round(n).toLocaleString("pt-BR");
const fmtPct = (frac: number) => `${(frac * 100).toFixed(1).replace(".", ",")}%`;
const fmtDate = (ymd: string) => {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
};
function statusColor(atingimento: number): [number, number, number] {
  if (atingimento >= 1) return GREEN;
  if (atingimento >= 0.7) return AMBER;
  return RED;
}

interface Col {
  label: string;
  width: number;
  align: "left" | "right";
  value: (row: SectorReportRow | OperatorReportRow, i: number) => string;
  color?: (row: SectorReportRow | OperatorReportRow) => [number, number, number] | null;
}

export function buildReportPdf(report: ProductionReport): Buffer {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const ROW_H = 20;

  function header() {
    doc.setFillColor(...INK);
    doc.rect(0, 0, PAGE_W, 64, "F");
    doc.setTextColor(...WHITE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("LISION", M, 38);
    doc.setFillColor(...GREEN);
    doc.rect(M, 46, 58, 3, "F");
    doc.setFontSize(11);
    doc.text(report.empresa, PAGE_W - M, 30, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(161, 161, 170);
    doc.text("Relatório de Produção", PAGE_W - M, 44, { align: "right" });
  }

  function periodLine() {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text(`Período: ${fmtDate(report.period.from)} – ${fmtDate(report.period.to)}`, M, 84);
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    const gen = new Date(report.generatedAt);
    doc.text(`Gerado em ${gen.toLocaleString("pt-BR")}`, PAGE_W - M, 84, { align: "right" });
  }

  function kpiCards(y: number): number {
    const gap = 12;
    const boxW = (CONTENT_W - 3 * gap) / 4;
    const boxH = 58;
    const cards: Array<{ label: string; value: string; color: [number, number, number] }> = [
      { label: "peças produzidas", value: fmtInt(report.resumo.producao_total), color: INK },
      { label: "defeitos", value: fmtInt(report.resumo.defeitos), color: INK },
      { label: "meta atingida", value: fmtPct(report.resumo.meta_pct), color: statusColor(report.resumo.meta_pct) },
      { label: "déficit acumulado", value: fmtInt(report.resumo.deficit_total), color: report.resumo.deficit_total > 0 ? RED : INK },
    ];
    cards.forEach((c, i) => {
      const x = M + i * (boxW + gap);
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.8);
      doc.roundedRect(x, y, boxW, boxH, 6, 6, "S");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.setTextColor(...c.color);
      doc.text(c.value, x + 10, y + 30);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text(c.label.toUpperCase(), x + 10, y + 46);
    });
    return y + boxH + 24;
  }

  function ensureSpace(y: number, need: number): number {
    if (y + need > PAGE_H - 60) {
      doc.addPage();
      header();
      return 92;
    }
    return y;
  }

  function sectionTitle(y: number, text: string): number {
    y = ensureSpace(y, 40);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...INK);
    doc.text(text, M, y);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.8);
    doc.line(M, y + 6, PAGE_W - M, y + 6);
    return y + 20;
  }

  function drawTable(
    y: number,
    cols: Col[],
    rows: Array<SectorReportRow | OperatorReportRow>,
    total?: { cells: string[]; },
  ): number {
    const xs: number[] = [];
    let x = M;
    for (const c of cols) { xs.push(x); x += c.width; }

    const drawHead = (yy: number): number => {
      doc.setFillColor(...HEADER_FILL);
      doc.rect(M, yy, CONTENT_W, ROW_H, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...INK);
      cols.forEach((c, i) => {
        const tx = c.align === "right" ? xs[i] + c.width - 6 : xs[i] + 6;
        doc.text(c.label, tx, yy + 14, { align: c.align });
      });
      return yy + ROW_H;
    };

    y = ensureSpace(y, ROW_H * 2);
    y = drawHead(y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    rows.forEach((row, i) => {
      if (y + ROW_H > PAGE_H - 60) {
        y = ensureSpace(y, ROW_H);
        y = drawHead(y);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
      }
      if (i % 2 === 1) {
        doc.setFillColor(...ZEBRA);
        doc.rect(M, y, CONTENT_W, ROW_H, "F");
      }
      cols.forEach((c, ci) => {
        const col = c.color?.(row) ?? INK;
        doc.setTextColor(...col);
        const tx = c.align === "right" ? xs[ci] + c.width - 6 : xs[ci] + 6;
        doc.text(c.value(row, i), tx, y + 14, { align: c.align });
      });
      y += ROW_H;
    });

    if (total) {
      doc.setDrawColor(...INK);
      doc.setLineWidth(1);
      doc.line(M, y, PAGE_W - M, y);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...INK);
      cols.forEach((c, ci) => {
        const tx = c.align === "right" ? xs[ci] + c.width - 6 : xs[ci] + 6;
        doc.text(total.cells[ci] || "", tx, y + 14, { align: c.align });
      });
      y += ROW_H;
    }
    return y + 16;
  }

  // ── Render ──
  header();
  periodLine();
  let y = kpiCards(100);

  // Por Setor
  y = sectionTitle(y, "Produção por Setor");
  const sectorCols: Col[] = [
    { label: "Setor", width: 150, align: "left", value: (r) => (r as SectorReportRow).setor },
    { label: "Meta", width: 95, align: "right", value: (r) => fmtInt((r as SectorReportRow).meta) },
    { label: "Realizado", width: 95, align: "right", value: (r) => fmtInt((r as SectorReportRow).realizado) },
    { label: "Atingimento", width: 90, align: "right", value: (r) => fmtPct((r as SectorReportRow).atingimento), color: (r) => statusColor((r as SectorReportRow).atingimento) },
    { label: "Déficit acum.", width: 85, align: "right", value: (r) => fmtInt((r as SectorReportRow).deficit), color: (r) => ((r as SectorReportRow).deficit > 0 ? RED : null) },
  ];
  const totAt = report.totais.meta > 0 ? report.totais.realizado / report.totais.meta : 0;
  y = drawTable(y, sectorCols, report.setores, {
    cells: ["TOTAL", fmtInt(report.totais.meta), fmtInt(report.totais.realizado), fmtPct(totAt), fmtInt(report.resumo.deficit_total)],
  });

  // Por Operador
  y = sectionTitle(y, "Produção por Operador");
  const opCols: Col[] = [
    { label: "#", width: 30, align: "left", value: (_r, i) => String(i + 1) },
    { label: "Operador", width: 165, align: "left", value: (r) => (r as OperatorReportRow).operador },
    { label: "Setor", width: 120, align: "left", value: (r) => (r as OperatorReportRow).setor },
    { label: "Meta", width: 70, align: "right", value: (r) => fmtInt((r as OperatorReportRow).meta) },
    { label: "Realizado", width: 70, align: "right", value: (r) => fmtInt((r as OperatorReportRow).realizado) },
    { label: "Ating.", width: 60, align: "right", value: (r) => fmtPct((r as OperatorReportRow).atingimento), color: (r) => statusColor((r as OperatorReportRow).atingimento) },
  ];
  drawTable(y, opCols, report.operadores);

  // Footers (paginação) em todas as páginas
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.8);
    doc.line(M, PAGE_H - 40, PAGE_W - M, PAGE_H - 40);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text("Gerado por LISION", M, PAGE_H - 26);
    doc.text(new Date(report.generatedAt).toLocaleString("pt-BR"), PAGE_W / 2, PAGE_H - 26, { align: "center" });
    doc.text(`Página ${i} de ${total}`, PAGE_W - M, PAGE_H - 26, { align: "right" });
  }

  const ab = doc.output("arraybuffer");
  return Buffer.from(ab);
}

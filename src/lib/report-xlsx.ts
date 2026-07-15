import ExcelJS from "exceljs";
import type { ProductionReport } from "@/lib/report-data";

/**
 * Frente 1 — Gera o .xlsx do relatório (3 abas: Resumo, Por Setor, Por Operador).
 * Larguras + formatos corretos (nada de ########); % como fração com formato 0.0%.
 */

const INK = "FF18181B";
const HEADER_TEXT = "FFFFFFFF";
const TOTAL_FILL = "FFF4F4F5";
const GREEN = "FF10B981";
const AMBER = "FFF59E0B";
const RED = "FFEF4444";

const FMT_PCS = "#,##0";
const FMT_PCT = "0.0%";
const FMT_DATE = "dd/mm/yyyy";

function statusColor(atingimento: number): string {
  if (atingimento >= 1) return GREEN;
  if (atingimento >= 0.7) return AMBER;
  return RED;
}

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: HEADER_TEXT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INK } };
    cell.alignment = { vertical: "middle" };
  });
}

export async function buildReportXlsx(report: ProductionReport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "LISION";
  wb.created = new Date(report.generatedAt);

  const fromD = new Date(`${report.period.from}T12:00:00.000Z`);
  const toD = new Date(`${report.period.to}T12:00:00.000Z`);

  // ── Aba Resumo ──
  const resumo = wb.addWorksheet("Resumo");
  resumo.getColumn(1).width = 26;
  resumo.getColumn(2).width = 22;
  resumo.mergeCells("A1:B1");
  const title = resumo.getCell("A1");
  title.value = "LISION — Relatório de Produção";
  title.font = { bold: true, size: 14, color: { argb: INK } };
  resumo.addRow([]);
  resumo.addRow(["Empresa", report.empresa]);
  const rFrom = resumo.addRow(["Período (de)", fromD]);
  rFrom.getCell(2).numFmt = FMT_DATE;
  const rTo = resumo.addRow(["Período (até)", toD]);
  rTo.getCell(2).numFmt = FMT_DATE;
  const rGen = resumo.addRow(["Gerado em", new Date(report.generatedAt)]);
  rGen.getCell(2).numFmt = "dd/mm/yyyy hh:mm";
  resumo.addRow([]);
  const kHead = resumo.addRow(["Indicador", "Valor"]);
  styleHeaderRow(kHead);
  const kProd = resumo.addRow(["Produção total (peças)", report.resumo.producao_total]);
  kProd.getCell(2).numFmt = FMT_PCS;
  resumo.addRow(["Defeitos", report.resumo.defeitos]).getCell(2).numFmt = FMT_PCS;
  const kMeta = resumo.addRow(["Meta atingida", report.resumo.meta_pct]);
  kMeta.getCell(2).numFmt = FMT_PCT;
  kMeta.getCell(2).font = { color: { argb: statusColor(report.resumo.meta_pct) }, bold: true };
  resumo.addRow(["Déficit acumulado (peças)", report.resumo.deficit_total]).getCell(2).numFmt = FMT_PCS;

  // ── Aba Por Setor ──
  const setor = wb.addWorksheet("Por Setor");
  setor.columns = [
    { header: "Setor", key: "setor", width: 24 },
    { header: "Meta (período)", key: "meta", width: 16, style: { numFmt: FMT_PCS } },
    { header: "Realizado", key: "realizado", width: 16, style: { numFmt: FMT_PCS } },
    { header: "Atingimento", key: "atingimento", width: 14, style: { numFmt: FMT_PCT } },
    { header: "Déficit acumulado", key: "deficit", width: 18, style: { numFmt: FMT_PCS } },
  ];
  styleHeaderRow(setor.getRow(1));
  for (const s of report.setores) {
    const row = setor.addRow({ setor: s.setor, meta: s.meta, realizado: s.realizado, atingimento: s.atingimento, deficit: s.deficit });
    row.getCell("atingimento").font = { color: { argb: statusColor(s.atingimento) } };
    if (s.deficit > 0) row.getCell("deficit").font = { color: { argb: RED } };
  }
  const setorTotal = setor.addRow({
    setor: "TOTAL",
    meta: report.totais.meta,
    realizado: report.totais.realizado,
    atingimento: report.totais.meta > 0 ? report.totais.realizado / report.totais.meta : 0,
    deficit: report.resumo.deficit_total,
  });
  setorTotal.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_FILL } };
  });
  setor.views = [{ state: "frozen", ySplit: 1 }];
  setor.autoFilter = { from: "A1", to: "E1" };

  // ── Aba Por Operador ──
  const op = wb.addWorksheet("Por Operador");
  op.columns = [
    { header: "#", key: "pos", width: 6 },
    { header: "Operador", key: "operador", width: 26 },
    { header: "Setor", key: "setor", width: 20 },
    { header: "Meta", key: "meta", width: 14, style: { numFmt: FMT_PCS } },
    { header: "Realizado", key: "realizado", width: 14, style: { numFmt: FMT_PCS } },
    { header: "Atingimento", key: "atingimento", width: 14, style: { numFmt: FMT_PCT } },
  ];
  styleHeaderRow(op.getRow(1));
  report.operadores.forEach((o, i) => {
    const row = op.addRow({ pos: i + 1, operador: o.operador, setor: o.setor, meta: o.meta, realizado: o.realizado, atingimento: o.atingimento });
    row.getCell("atingimento").font = { color: { argb: statusColor(o.atingimento) } };
  });
  op.views = [{ state: "frozen", ySplit: 1 }];
  op.autoFilter = { from: "A1", to: "F1" };

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

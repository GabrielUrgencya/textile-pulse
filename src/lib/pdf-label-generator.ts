import { jsPDF } from "jspdf";
import bwipjs from "bwip-js";
import type { LotLabelData } from "./zpl-generator";

/**
 * Generate a PDF with lot labels containing Code128 barcodes.
 * Each label: 50x25mm, barcode + human-readable text.
 * Labels arranged in a grid: 2 columns per page.
 */
export async function generatePDF(lots: LotLabelData[]): Promise<ArrayBuffer> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const labelW = 90; // mm
  const labelH = 30; // mm
  const marginX = 15;
  const marginY = 15;
  const cols = 2;
  const gapX = 5;
  const gapY = 5;
  const labelsPerPage = Math.floor((297 - 2 * marginY) / (labelH + gapY)) * cols;

  for (let i = 0; i < lots.length; i++) {
    const pageIndex = Math.floor(i / labelsPerPage);
    const posOnPage = i % labelsPerPage;

    if (pageIndex > 0 && posOnPage === 0) {
      doc.addPage();
    }

    const col = posOnPage % cols;
    const row = Math.floor(posOnPage / cols);
    const x = marginX + col * (labelW + gapX);
    const y = marginY + row * (labelH + gapY);

    // Draw label border
    doc.setDrawColor(200);
    doc.rect(x, y, labelW, labelH);

    // Generate barcode image
    try {
      const pngBuffer = await bwipjs.toBuffer({
        bcid: "code128",
        text: lots[i].barcode,
        scale: 2,
        height: 8,
        includetext: true,
        textxalign: "center",
        textsize: 8,
      });

      const base64 = pngBuffer.toString("base64");
      doc.addImage(`data:image/png;base64,${base64}`, "PNG", x + 3, y + 2, 60, 12);
    } catch {
      // Fallback: just print barcode text if image generation fails
      doc.setFontSize(8);
      doc.text(lots[i].barcode, x + 3, y + 8);
    }

    // Text info below barcode
    doc.setFontSize(7);
    doc.text(`${lots[i].op_number} | ${lots[i].lot_number}`, x + 3, y + 19);
    doc.text(lots[i].product_name.substring(0, 35), x + 3, y + 23);
    if (lots[i].reference) {
      doc.text(`Ref: ${lots[i].reference!.substring(0, 30)}`, x + 3, y + 27);
    }
  }

  return doc.output("arraybuffer");
}

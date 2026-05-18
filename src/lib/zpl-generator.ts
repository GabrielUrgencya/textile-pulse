/**
 * Generates ZPL (Zebra Programming Language) for lot labels.
 * Target printer: Zebra GC420t
 * Label size: 50x25mm (~400x200 dots at 203dpi)
 */

interface LotLabelData {
  barcode: string;
  op_number: string;
  lot_number: string;
  product_name: string;
  reference: string | null;
}

/**
 * Generate ZPL for a single label with Code128 barcode.
 * Layout: Barcode at top, human-readable text below.
 */
function generateSingleLabel(lot: LotLabelData): string {
  const ref = lot.reference || "";
  return [
    "^XA",                          // Start label
    "^CF0,20",                      // Default font size 20
    "^FO30,20^BY2",                 // Position barcode, module width 2
    `^BCN,80,Y,N,N`,               // Code128, height 80, print interpretation
    `^FD${lot.barcode}^FS`,        // Barcode data
    `^FO30,120^FD${lot.op_number} | ${lot.lot_number}^FS`, // OP + Lot
    `^FO30,145^FD${lot.product_name.substring(0, 30)}^FS`, // Product (max 30 chars)
    ref ? `^FO30,170^FDRef: ${ref.substring(0, 25)}^FS` : "",
    "^XZ",                          // End label
  ].filter(Boolean).join("\n");
}

/**
 * Generate ZPL for multiple labels.
 * Each label is a separate ^XA...^XZ block.
 */
export function generateZPL(lots: LotLabelData[]): string {
  return lots.map(generateSingleLabel).join("\n");
}

export type { LotLabelData };

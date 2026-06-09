/**
 * CSV export utilities.
 * Story 8.11 — ERP Export
 */

/**
 * Generate CSV string from array of objects.
 * Uses semicolon separator for Excel compatibility in pt-BR locale.
 */
export function generateCSV(
  data: Record<string, unknown>[],
  columns: { key: string; header: string }[]
): string {
  const header = columns.map((c) => c.header).join(";");
  const rows = data.map((row) =>
    columns
      .map((c) => {
        const val = row[c.key];
        if (val === null || val === undefined) return "";
        const str = String(val);
        // Escape values with semicolons, quotes, or newlines
        if (str.includes(";") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      })
      .join(";")
  );

  // BOM for Excel UTF-8 recognition
  return "\uFEFF" + [header, ...rows].join("\n");
}

/**
 * Trigger browser download of a string as a file.
 */
export function downloadFile(
  content: string,
  filename: string,
  mimeType = "text/csv;charset=utf-8"
) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

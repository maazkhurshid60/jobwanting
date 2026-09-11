// Safe CSV serialization.
// - Always quotes and doubles embedded quotes so commas/quotes/newlines can't
//   break the row structure.
// - Neutralizes spreadsheet formula injection: a value starting with = + - @
//   (or a control char) is prefixed with a single quote so Excel/Sheets won't
//   execute it as a formula.
export function csvCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

export function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}

// Forces spreadsheet apps (Excel, Google Sheets) to treat the value as TEXT so
// leading zeros survive — e.g. a ZIP code like 02886 stays "02886" instead of
// being coerced to the number 2886. Uses the ="..." convention, which also
// happens to be injection-safe: the value becomes a plain string literal.
export function csvTextCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (s === "") return '""';
  const cell = `="${s.replace(/"/g, '""')}"`;   // what Excel should see
  return `"${cell.replace(/"/g, '""')}"`;         // CSV-escape the whole field
}
